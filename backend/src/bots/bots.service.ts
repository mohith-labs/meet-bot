import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import {
  Meeting,
  MeetingPlatform,
  MeetingStatus,
} from '../entities/meeting.entity';
import { TranscriptSegment } from '../entities/transcript-segment.entity';
import { CreateBotDto, UpdateBotConfigDto } from './dto/create-bot.dto';
import { GoogleMeetBotService, CaptionEvent } from './google-meet-bot.service';
import { TranscriptGateway } from '../websocket/transcript.gateway';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);

  /**
   * Tracks the wallclock time when each meeting became ACTIVE.
   * Used to compute relative startTime/endTime on transcript segments.
   */
  private readonly meetingStartTimes = new Map<string, Date>();

  /**
   * Accumulates final caption entries in memory per meeting.
   * Flushed to the database when the meeting ends or the bot is stopped.
   */
  private readonly transcriptBuffers = new Map<string, Array<{ speaker: string; text: string; timestamp: Date }>>();

  constructor(
    @InjectRepository(Meeting)
    private readonly meetingsRepository: Repository<Meeting>,
    @InjectRepository(TranscriptSegment)
    private readonly transcriptSegmentsRepository: Repository<TranscriptSegment>,
    private readonly googleMeetBotService: GoogleMeetBotService,
    @Inject(forwardRef(() => TranscriptGateway))
    private readonly transcriptGateway: TranscriptGateway,
    private readonly configService: ConfigService,
    private readonly webhookDispatcher: WebhookDispatcherService,
    private readonly usersService: UsersService,
  ) {}

  // ---------------------------------------------------------------------------
  // Create bot
  // ---------------------------------------------------------------------------

  async createBot(userId: string, createBotDto: CreateBotDto): Promise<Meeting> {
    // Check for duplicate active bot
    const existingMeeting = await this.meetingsRepository.findOne({
      where: {
        userId,
        platform: createBotDto.platform,
        nativeMeetingId: createBotDto.nativeMeetingId,
        status: In([
          MeetingStatus.REQUESTED,
          MeetingStatus.JOINING,
          MeetingStatus.AWAITING_ADMISSION,
          MeetingStatus.ACTIVE,
        ]),
      },
    });

    if (existingMeeting) {
      throw new BadRequestException(
        'A bot is already active or joining this meeting',
      );
    }

    // Construct the meeting URL based on platform
    let constructedMeetingUrl: string;
    switch (createBotDto.platform) {
      case MeetingPlatform.GOOGLE_MEET:
        constructedMeetingUrl = `https://meet.google.com/${createBotDto.nativeMeetingId}`;
        break;
      default:
        constructedMeetingUrl = createBotDto.nativeMeetingId;
    }

    const defaultBotName = this.configService.get<string>('BOT_NAME', 'MeetBot');
    const botName = createBotDto.botName || defaultBotName;

    // Create the meeting record
    const meeting = this.meetingsRepository.create({
      userId,
      platform: createBotDto.platform,
      nativeMeetingId: createBotDto.nativeMeetingId,
      constructedMeetingUrl,
      status: MeetingStatus.REQUESTED,
      botContainerId: `bot-${uuidv4().substring(0, 8)}`,
      data: {
        botName,
        language: createBotDto.language || 'en',
        recordingEnabled: createBotDto.recordingEnabled ?? false,
        transcribeEnabled: createBotDto.transcribeEnabled ?? true,
      },
    });

    const savedMeeting = await this.meetingsRepository.save(meeting);
    const meetingId = savedMeeting.id;
    const meetingKey = `${createBotDto.platform}/${createBotDto.nativeMeetingId}`;

    this.logger.log(
      `Created meeting ${meetingId} — launching bot for ${meetingKey}`,
    );

    // Launch the real bot (async — doesn't block the response)
    this.launchBot(meetingId, meetingKey, constructedMeetingUrl, botName, userId);

    return savedMeeting;
  }

  // ---------------------------------------------------------------------------
  // Bot lifecycle — wire events
  // ---------------------------------------------------------------------------

  private async launchBot(
    meetingId: string,
    meetingKey: string,
    meetingUrl: string,
    botName: string,
    userId: string,
  ): Promise<void> {
    let emitter: EventEmitter;

    // Fetch user settings for auto-exit
    const user = await this.usersService.findById(userId);
    const autoExitMinutes = user?.botAutoExitEnabled
      ? (user?.botAutoExitMinutes || 5)
      : 0;

    try {
      emitter = await this.googleMeetBotService.joinMeeting({
        meetingUrl,
        botName,
        meetingKey: meetingId, // use DB ID as the unique key inside GoogleMeetBotService
        autoExitMinutes,
      });
    } catch (error) {
      this.logger.error(
        `Failed to launch bot for meeting ${meetingId}: ${error.message}`,
      );
      await this.setMeetingStatus(meetingId, meetingKey, MeetingStatus.FAILED);
      return;
    }

    // ── Status events ──────────────────────────────────────────────
    emitter.on('status', async (status: string) => {
      this.logger.log(`Bot status for ${meetingId}: ${status}`);
      await this.handleStatusEvent(meetingId, meetingKey, status);
    });

    // ── Caption events ─────────────────────────────────────────────
    emitter.on('caption', async (caption: CaptionEvent) => {
      await this.handleCaptionEvent(meetingId, meetingKey, caption);
    });

    // ── Meeting ended naturally ────────────────────────────────────
    emitter.on('ended', async () => {
      this.logger.log(`Meeting ended naturally: ${meetingId}`);
      await this.handleMeetingEnded(meetingId, meetingKey);
    });

    // ── Error events ───────────────────────────────────────────────
    emitter.on('error', async (error: Error) => {
      this.logger.error(
        `Bot error for meeting ${meetingId}: ${error.message}`,
        error.stack,
      );
      await this.setMeetingStatus(meetingId, meetingKey, MeetingStatus.FAILED);
    });
  }

  // ---------------------------------------------------------------------------
  // Status event handler
  // ---------------------------------------------------------------------------

  private async handleStatusEvent(
    meetingId: string,
    meetingKey: string,
    status: string,
  ): Promise<void> {
    const mappedStatus = this.mapStatus(status);

    if (mappedStatus === MeetingStatus.ACTIVE) {
      // Record meeting start time
      const now = new Date();
      this.meetingStartTimes.set(meetingId, now);
      await this.meetingsRepository.update(meetingId, {
        status: mappedStatus,
        startTime: now,
      });

      // Dispatch meeting.started webhook
      const meeting = await this.meetingsRepository.findOne({ where: { id: meetingId } });
      if (meeting) {
        this.webhookDispatcher.dispatch(meeting.userId, 'meeting.started', {
          meetingId: meeting.id,
          platform: meeting.platform,
          nativeMeetingId: meeting.nativeMeetingId,
          meetingUrl: meeting.constructedMeetingUrl,
          botName: meeting.data?.botName || 'MeetBot',
          status: 'active',
          startTime: meeting.startTime?.toISOString(),
        });
      }
    } else {
      await this.meetingsRepository.update(meetingId, {
        status: mappedStatus,
      });
    }

    // Broadcast status to WebSocket subscribers (by meeting ID and by platform key)
    this.broadcastStatus(meetingId, meetingKey, mappedStatus);
  }

  private mapStatus(status: string): MeetingStatus {
    switch (status.toLowerCase()) {
      case 'joining':
        return MeetingStatus.JOINING;
      case 'awaiting_admission':
        return MeetingStatus.AWAITING_ADMISSION;
      case 'active':
        return MeetingStatus.ACTIVE;
      case 'stopping':
        return MeetingStatus.STOPPING;
      case 'completed':
        return MeetingStatus.COMPLETED;
      case 'failed':
        return MeetingStatus.FAILED;
      default:
        this.logger.warn(`Unknown status "${status}", defaulting to JOINING`);
        return MeetingStatus.JOINING;
    }
  }

  // ---------------------------------------------------------------------------
  // Caption event handler
  // ---------------------------------------------------------------------------

  private async handleCaptionEvent(
    meetingId: string,
    meetingKey: string,
    caption: CaptionEvent,
  ): Promise<void> {
    // Only accumulate final captions
    if (!caption.isFinal) return;

    if (!this.transcriptBuffers.has(meetingId)) {
      this.transcriptBuffers.set(meetingId, []);
    }

    this.transcriptBuffers.get(meetingId)!.push({
      speaker: caption.speaker || 'Unknown',
      text: caption.text,
      timestamp: caption.timestamp,
    });

    this.logger.log(
      `Caption buffered for ${meetingId}: [${caption.speaker}] "${caption.text}"`,
    );
  }

  // ---------------------------------------------------------------------------
  // Meeting ended
  // ---------------------------------------------------------------------------

  private async handleMeetingEnded(
    meetingId: string,
    meetingKey: string,
  ): Promise<void> {
    try {
      // Flush any remaining caption from the bot BEFORE saving
      this.flushRemainingCaption(meetingId);

      // Save all accumulated transcript segments
      await this.saveBufferedTranscripts(meetingId);

      // Dispatch meeting.ended webhook with transcript data
      const meeting = await this.meetingsRepository.findOne({ where: { id: meetingId } });
      const segments = await this.transcriptSegmentsRepository.find({
        where: { meetingId },
        order: { startTime: 'ASC' },
      });

      if (meeting) {
        this.webhookDispatcher.dispatch(meeting.userId, 'meeting.ended', {
          meetingId: meeting.id,
          platform: meeting.platform,
          nativeMeetingId: meeting.nativeMeetingId,
          meetingUrl: meeting.constructedMeetingUrl,
          botName: meeting.data?.botName || 'MeetBot',
          status: 'completed',
          startTime: meeting.startTime?.toISOString(),
          endTime: new Date().toISOString(),
          transcript: {
            totalSegments: segments.length,
            fullText: segments.map(s => s.text).join(' '),
            segments: segments.map(s => ({
              speaker: s.speaker,
              text: s.text,
              startTime: s.startTime,
              endTime: s.endTime,
            })),
          },
        });
      }

      await this.meetingsRepository.update(meetingId, {
        status: MeetingStatus.COMPLETED,
        endTime: new Date(),
      });

      this.meetingStartTimes.delete(meetingId);
      this.broadcastStatus(meetingId, meetingKey, MeetingStatus.COMPLETED);
    } catch (error) {
      this.logger.error(
        `Error handling meeting ended for ${meetingId}: ${error.message}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Stop bot
  // ---------------------------------------------------------------------------

  async stopBot(
    userId: string,
    platform: MeetingPlatform,
    nativeMeetingId: string,
  ): Promise<Meeting> {
    const meeting = await this.meetingsRepository.findOne({
      where: {
        userId,
        platform,
        nativeMeetingId,
        status: In([
          MeetingStatus.REQUESTED,
          MeetingStatus.JOINING,
          MeetingStatus.AWAITING_ADMISSION,
          MeetingStatus.ACTIVE,
        ]),
      },
    });

    if (!meeting) {
      throw new NotFoundException('No active bot found for this meeting');
    }

    const meetingKey = `${platform}/${nativeMeetingId}`;

    // Transition to STOPPING
    meeting.status = MeetingStatus.STOPPING;
    await this.meetingsRepository.save(meeting);
    this.broadcastStatus(meeting.id, meetingKey, MeetingStatus.STOPPING);

    // Flush remaining caption BEFORE stopping the browser (stopBot deletes
    // the bot from the activeBots map, making getRemainingCaption return null)
    this.flushRemainingCaption(meeting.id);

    // Save all accumulated transcript segments
    await this.saveBufferedTranscripts(meeting.id);

    // Dispatch meeting.ended webhook with transcript data
    const segments = await this.transcriptSegmentsRepository.find({
      where: { meetingId: meeting.id },
      order: { startTime: 'ASC' },
    });

    this.webhookDispatcher.dispatch(meeting.userId, 'meeting.ended', {
      meetingId: meeting.id,
      platform: meeting.platform,
      nativeMeetingId: meeting.nativeMeetingId,
      meetingUrl: meeting.constructedMeetingUrl,
      botName: meeting.data?.botName || 'MeetBot',
      status: 'completed',
      startTime: meeting.startTime?.toISOString(),
      endTime: new Date().toISOString(),
      transcript: {
        totalSegments: segments.length,
        fullText: segments.map(s => s.text).join(' '),
        segments: segments.map(s => ({
          speaker: s.speaker,
          text: s.text,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
      },
    });

    // NOW stop the Playwright browser (safe — captions already saved)
    try {
      await this.googleMeetBotService.stopBot(meeting.id);
    } catch (error) {
      this.logger.error(
        `Error stopping bot browser for ${meeting.id}: ${error.message}`,
      );
    }

    // Mark as completed
    meeting.status = MeetingStatus.COMPLETED;
    meeting.endTime = new Date();
    await this.meetingsRepository.save(meeting);

    this.meetingStartTimes.delete(meeting.id);
    this.broadcastStatus(meeting.id, meetingKey, MeetingStatus.COMPLETED);

    this.logger.log(`Bot stopped for meeting ${platform}/${nativeMeetingId}`);

    return meeting;
  }

  // ---------------------------------------------------------------------------
  // Get bot status
  // ---------------------------------------------------------------------------

  async getBotStatus(userId: string): Promise<Meeting[]> {
    const meetings = await this.meetingsRepository.find({
      where: {
        userId,
        status: In([
          MeetingStatus.REQUESTED,
          MeetingStatus.JOINING,
          MeetingStatus.AWAITING_ADMISSION,
          MeetingStatus.ACTIVE,
          MeetingStatus.STOPPING,
        ]),
      },
      order: { createdAt: 'DESC' },
    });

    // Enrich with live bot-running information
    return meetings.map((meeting) => {
      const isActuallyRunning = this.googleMeetBotService.isRunning(meeting.id);
      // If the DB says it's active but the bot process isn't running, the meeting
      // may have ended ungracefully — but we don't update the DB here to avoid
      // side effects in a read-only query. The caller can check `data.botRunning`.
      meeting.data = {
        ...meeting.data,
        botRunning: isActuallyRunning,
      };
      return meeting;
    });
  }

  // ---------------------------------------------------------------------------
  // Update bot config
  // ---------------------------------------------------------------------------

  async updateBotConfig(
    userId: string,
    platform: MeetingPlatform,
    nativeMeetingId: string,
    updateDto: UpdateBotConfigDto,
  ): Promise<Meeting> {
    const meeting = await this.meetingsRepository.findOne({
      where: {
        userId,
        platform,
        nativeMeetingId,
        status: In([
          MeetingStatus.REQUESTED,
          MeetingStatus.JOINING,
          MeetingStatus.AWAITING_ADMISSION,
          MeetingStatus.ACTIVE,
        ]),
      },
    });

    if (!meeting) {
      throw new NotFoundException('No active bot found for this meeting');
    }

    const currentData = meeting.data || {};
    meeting.data = {
      ...currentData,
      ...(updateDto.language !== undefined && { language: updateDto.language }),
      ...(updateDto.recordingEnabled !== undefined && {
        recordingEnabled: updateDto.recordingEnabled,
      }),
      ...(updateDto.transcribeEnabled !== undefined && {
        transcribeEnabled: updateDto.transcribeEnabled,
      }),
    };

    return this.meetingsRepository.save(meeting);
  }

  // ---------------------------------------------------------------------------
  // Broadcast helpers
  // ---------------------------------------------------------------------------

  private broadcastStatus(
    meetingId: string,
    meetingKey: string,
    status: MeetingStatus,
  ): void {
    try {
      // Broadcast to subscribers by meeting UUID
      this.transcriptGateway.broadcastMeetingStatus(meetingId, status);
      // Also broadcast to subscribers by platform/nativeMeetingId key
      this.transcriptGateway.broadcastMeetingStatus(meetingKey, status);
    } catch (error) {
      this.logger.warn(`Failed to broadcast status: ${error.message}`);
    }
  }

  /**
   * Pull any remaining unfinalised caption from the bot and add it to the buffer.
   * Must be called synchronously BEFORE saveBufferedTranscripts.
   */
  private flushRemainingCaption(meetingId: string): void {
    const remaining = this.googleMeetBotService.getRemainingCaption(meetingId);
    if (remaining) {
      if (!this.transcriptBuffers.has(meetingId)) {
        this.transcriptBuffers.set(meetingId, []);
      }
      this.transcriptBuffers.get(meetingId)!.push({
        speaker: remaining.speaker || 'Unknown',
        text: remaining.text,
        timestamp: remaining.timestamp,
      });
      this.logger.log(
        `Flushed remaining caption for ${meetingId}: [${remaining.speaker}] "${remaining.text}"`,
      );
    }
  }

  private async saveBufferedTranscripts(meetingId: string): Promise<void> {
    const buffer = this.transcriptBuffers.get(meetingId);
    if (!buffer || buffer.length === 0) {
      this.logger.log(`No transcript segments to save for meeting ${meetingId}`);
      this.transcriptBuffers.delete(meetingId);
      return;
    }

    const meetingStart = this.meetingStartTimes.get(meetingId);

    try {
      const segments = buffer.map((entry, index) => {
        let startTime = 0;
        let endTime = 0;
        if (meetingStart) {
          startTime = (entry.timestamp.getTime() - meetingStart.getTime()) / 1000;
          // Estimate end time as start of next segment, or +3s for last segment
          const nextEntry = buffer[index + 1];
          endTime = nextEntry
            ? (nextEntry.timestamp.getTime() - meetingStart.getTime()) / 1000
            : startTime + 3;
        }

        return this.transcriptSegmentsRepository.create({
          meetingId,
          text: entry.text,
          speaker: entry.speaker,
          language: 'en',
          startTime,
          endTime,
          absoluteStartTime: entry.timestamp,
          absoluteEndTime: new Date(entry.timestamp.getTime() + (endTime - startTime) * 1000),
          completed: true,
        });
      });

      await this.transcriptSegmentsRepository.save(segments);
      this.logger.log(
        `Saved ${segments.length} transcript segments for meeting ${meetingId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to save transcript buffer for ${meetingId}: ${error.message}`,
      );
    }

    this.transcriptBuffers.delete(meetingId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async setMeetingStatus(
    meetingId: string,
    meetingKey: string,
    status: MeetingStatus,
  ): Promise<void> {
    try {
      const update: Partial<Meeting> = { status };
      if (status === MeetingStatus.COMPLETED || status === MeetingStatus.FAILED) {
        update.endTime = new Date();
        // Try to save any accumulated transcripts before cleanup
        this.flushRemainingCaption(meetingId);
        await this.saveBufferedTranscripts(meetingId);
        this.meetingStartTimes.delete(meetingId);
      }
      await this.meetingsRepository.update(meetingId, update);
      this.broadcastStatus(meetingId, meetingKey, status);
    } catch (error) {
      this.logger.error(
        `Failed to update meeting status for ${meetingId}: ${error.message}`,
      );
    }
  }
}
