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

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);

  /**
   * Tracks the wallclock time when each meeting became ACTIVE.
   * Used to compute relative startTime/endTime on transcript segments.
   */
  private readonly meetingStartTimes = new Map<string, Date>();

  /**
   * Tracks the absoluteStartTime (epoch ms) for the current active segment
   * per meeting. Keyed by meetingId. When a new interim caption arrives for
   * the first time (or after a final), we record Date.now(). Subsequent
   * interim updates for the same speaker reuse this value.
   */
  private readonly activeSegmentStartTimes = new Map<string, number>();

  constructor(
    @InjectRepository(Meeting)
    private readonly meetingsRepository: Repository<Meeting>,
    @InjectRepository(TranscriptSegment)
    private readonly transcriptSegmentsRepository: Repository<TranscriptSegment>,
    private readonly googleMeetBotService: GoogleMeetBotService,
    @Inject(forwardRef(() => TranscriptGateway))
    private readonly transcriptGateway: TranscriptGateway,
    private readonly configService: ConfigService,
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
    this.launchBot(meetingId, meetingKey, constructedMeetingUrl, botName);

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
  ): Promise<void> {
    let emitter: EventEmitter;

    try {
      emitter = await this.googleMeetBotService.joinMeeting({
        meetingUrl,
        botName,
        meetingKey: meetingId, // use DB ID as the unique key inside GoogleMeetBotService
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
    // Track absoluteStartTime: record Date.now() when the first interim
    // arrives for a segment; reuse it for subsequent interims and the final.
    if (!this.activeSegmentStartTimes.has(meetingId)) {
      this.activeSegmentStartTimes.set(meetingId, Date.now());
    }
    const absoluteStartTime = this.activeSegmentStartTimes.get(meetingId)!;

    // Only persist final captions to the database
    if (!caption.isFinal) {
      // Broadcast interim captions to WebSocket (live preview), but don't save
      this.broadcastTranscript(meetingId, meetingKey, {
        id: `interim-${absoluteStartTime}`,
        text: caption.text,
        speaker: caption.speaker,
        language: 'en',
        startTime: 0,
        endTime: 0,
        absoluteStartTime,
        isFinal: false,
      });
      return;
    }

    // Final caption — clear the tracked start time so the next segment gets a fresh one
    this.activeSegmentStartTimes.delete(meetingId);

    // Calculate relative times from meeting start
    const meetingStart = this.meetingStartTimes.get(meetingId);
    const now = new Date();

    let startTime = 0;
    let endTime = 0;
    if (meetingStart) {
      endTime = (now.getTime() - meetingStart.getTime()) / 1000;
      startTime = Math.max(
        0,
        (absoluteStartTime - meetingStart.getTime()) / 1000,
      );
    }

    try {
      const segment = this.transcriptSegmentsRepository.create({
        meetingId,
        text: caption.text,
        speaker: caption.speaker || 'Unknown',
        language: 'en',
        startTime,
        endTime,
        absoluteStartTime: new Date(absoluteStartTime),
        absoluteEndTime: now,
        completed: true,
      });

      const saved = await this.transcriptSegmentsRepository.save(segment);

      this.logger.log(
        `Transcript saved for ${meetingId}: [${caption.speaker}] "${caption.text}"`,
      );

      // Broadcast final caption to WebSocket subscribers
      this.broadcastTranscript(meetingId, meetingKey, {
        id: saved.id,
        text: saved.text,
        speaker: saved.speaker,
        language: saved.language,
        startTime: saved.startTime,
        endTime: saved.endTime,
        absoluteStartTime,
        isFinal: true,
      });
    } catch (error) {
      this.logger.error(
        `Failed to save transcript segment for ${meetingId}: ${error.message}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Meeting ended
  // ---------------------------------------------------------------------------

  private async handleMeetingEnded(
    meetingId: string,
    meetingKey: string,
  ): Promise<void> {
    try {
      await this.meetingsRepository.update(meetingId, {
        status: MeetingStatus.COMPLETED,
        endTime: new Date(),
      });

      this.meetingStartTimes.delete(meetingId);
      this.activeSegmentStartTimes.delete(meetingId);
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

    // Actually stop the Playwright browser
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
    this.activeSegmentStartTimes.delete(meeting.id);
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

  private broadcastTranscript(
    meetingId: string,
    meetingKey: string,
    segment: {
      id: string;
      text: string;
      speaker: string;
      language: string;
      startTime: number;
      endTime: number;
      absoluteStartTime: number;
      isFinal: boolean;
    },
  ): void {
    try {
      if (segment.isFinal) {
        const finalSegment = segment as typeof segment & { isFinal: true };
        // Broadcast to subscribers by meeting UUID
        this.transcriptGateway.broadcastTranscriptFinal(meetingId, finalSegment);
        // Also broadcast to subscribers by platform/nativeMeetingId key
        this.transcriptGateway.broadcastTranscriptFinal(meetingKey, finalSegment);
      } else {
        const mutableSegment = segment as typeof segment & { isFinal: false };
        // Broadcast to subscribers by meeting UUID
        this.transcriptGateway.broadcastTranscriptMutable(meetingId, mutableSegment);
        // Also broadcast to subscribers by platform/nativeMeetingId key
        this.transcriptGateway.broadcastTranscriptMutable(meetingKey, mutableSegment);
      }
    } catch (error) {
      this.logger.warn(`Failed to broadcast transcript: ${error.message}`);
    }
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
        this.meetingStartTimes.delete(meetingId);
        this.activeSegmentStartTimes.delete(meetingId);
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
