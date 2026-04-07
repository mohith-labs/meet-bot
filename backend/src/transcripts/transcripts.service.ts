import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Meeting, MeetingPlatform } from '../entities/meeting.entity';
import { TranscriptSegment } from '../entities/transcript-segment.entity';

@Injectable()
export class TranscriptsService {
  constructor(
    @InjectRepository(Meeting)
    private readonly meetingsRepository: Repository<Meeting>,
    @InjectRepository(TranscriptSegment)
    private readonly transcriptSegmentsRepository: Repository<TranscriptSegment>,
  ) {}

  async getTranscript(
    userId: string,
    platform: MeetingPlatform,
    nativeMeetingId: string,
  ) {
    const meeting = await this.meetingsRepository.findOne({
      where: { userId, platform, nativeMeetingId },
      order: { createdAt: 'DESC' },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    const segments = await this.transcriptSegmentsRepository.find({
      where: { meetingId: meeting.id },
      order: { startTime: 'ASC', createdAt: 'ASC' },
    });

    return {
      meeting: {
        id: meeting.id,
        platform: meeting.platform,
        nativeMeetingId: meeting.nativeMeetingId,
        constructedMeetingUrl: meeting.constructedMeetingUrl,
        status: meeting.status,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        data: meeting.data,
      },
      segments: segments.map((seg) => ({
        id: seg.id,
        text: seg.text,
        speaker: seg.speaker,
        language: seg.language,
        startTime: seg.startTime,
        endTime: seg.endTime,
        absoluteStartTime: seg.absoluteStartTime,
        absoluteEndTime: seg.absoluteEndTime,
        completed: seg.completed,
        createdAt: seg.createdAt,
      })),
      totalSegments: segments.length,
      fullText: segments.map((s) => `[${s.speaker || 'Unknown'}]: ${s.text}`).join('\n'),
    };
  }

  async getTranscriptByMeetingId(userId: string, meetingId: string) {
    const meeting = await this.meetingsRepository.findOne({
      where: { id: meetingId, userId },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    const segments = await this.transcriptSegmentsRepository.find({
      where: { meetingId: meeting.id },
      order: { startTime: 'ASC', createdAt: 'ASC' },
    });

    return {
      meeting: {
        id: meeting.id,
        platform: meeting.platform,
        nativeMeetingId: meeting.nativeMeetingId,
        constructedMeetingUrl: meeting.constructedMeetingUrl,
        status: meeting.status,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        data: meeting.data,
      },
      segments: segments.map((seg) => ({
        id: seg.id,
        text: seg.text,
        speaker: seg.speaker,
        language: seg.language,
        startTime: seg.startTime,
        endTime: seg.endTime,
        absoluteStartTime: seg.absoluteStartTime,
        absoluteEndTime: seg.absoluteEndTime,
        completed: seg.completed,
        createdAt: seg.createdAt,
      })),
      totalSegments: segments.length,
      fullText: segments
        .map((s) => `[${s.speaker || 'Unknown'}]: ${s.text}`)
        .join('\n'),
    };
  }

  async createSegment(
    meetingId: string,
    data: {
      text: string;
      speaker?: string;
      language?: string;
      startTime?: number;
      endTime?: number;
      completed?: boolean;
    },
  ): Promise<TranscriptSegment> {
    const meeting = await this.meetingsRepository.findOne({
      where: { id: meetingId },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    const segment = this.transcriptSegmentsRepository.create({
      meetingId,
      text: data.text,
      speaker: data.speaker || 'Unknown',
      language: data.language || 'en',
      startTime: data.startTime,
      endTime: data.endTime,
      absoluteStartTime: new Date(),
      absoluteEndTime: new Date(),
      completed: data.completed ?? true,
    });

    return this.transcriptSegmentsRepository.save(segment);
  }

  async shareTranscript(
    userId: string,
    platform: MeetingPlatform,
    nativeMeetingId: string,
  ) {
    const meeting = await this.meetingsRepository.findOne({
      where: { userId, platform, nativeMeetingId },
      order: { createdAt: 'DESC' },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Generate a share token. In production, this would create a
    // publicly accessible link with optional expiration.
    const shareToken = uuidv4();

    // Store the share token in meeting data
    meeting.data = {
      ...(meeting.data || {}),
      shareToken,
      sharedAt: new Date().toISOString(),
    };
    await this.meetingsRepository.save(meeting);

    return {
      shareToken,
      shareUrl: `/transcripts/shared/${shareToken}`,
      message:
        'Transcript shared. Anyone with the link can view the transcript.',
    };
  }
}
