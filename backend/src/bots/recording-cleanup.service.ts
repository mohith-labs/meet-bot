import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { AppSettings } from '../entities/app-settings.entity';
import { Meeting, MeetingStatus } from '../entities/meeting.entity';
import { TranscriptSegment } from '../entities/transcript-segment.entity';
import { resolveStoragePath } from '../config/storage.config';

@Injectable()
export class RecordingCleanupService implements OnModuleInit {
  private readonly logger = new Logger(RecordingCleanupService.name);

  constructor(
    @InjectRepository(AppSettings)
    private readonly appSettingsRepository: Repository<AppSettings>,
    @InjectRepository(Meeting)
    private readonly meetingsRepository: Repository<Meeting>,
    @InjectRepository(TranscriptSegment)
    private readonly transcriptSegmentsRepository: Repository<TranscriptSegment>,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    // Run cleanup once on startup (30s delay to let the app settle),
    // then every 24 hours.
    setTimeout(() => this.runCleanup(), 30_000);
    setInterval(() => this.runCleanup(), 24 * 60 * 60 * 1000);
  }

  async runCleanup(): Promise<void> {
    try {
      const setting = await this.appSettingsRepository.findOne({
        where: { key: 'recording_retention_days' },
      });
      const retentionDays = parseInt(setting?.value || '7', 10);
      if (retentionDays <= 0) {
        this.logger.debug('Retention is 0 (keep forever) — skipping cleanup');
        return;
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      this.logger.log(
        `Running cleanup: deleting data older than ${retentionDays} days (before ${cutoffDate.toISOString()})`,
      );

      const storagePath = resolveStoragePath(this.configService);

      // Find all completed/failed meetings older than the cutoff
      const meetings = await this.meetingsRepository
        .createQueryBuilder('meeting')
        .where('meeting.endTime < :cutoff', { cutoff: cutoffDate.toISOString() })
        .andWhere('meeting.status IN (:...statuses)', {
          statuses: [MeetingStatus.COMPLETED, MeetingStatus.FAILED],
        })
        .getMany();

      if (meetings.length === 0) {
        this.logger.debug('No old meetings to clean up');
        return;
      }

      let deletedFiles = 0;
      let deletedMeetings = 0;
      let deletedSegments = 0;

      for (const meeting of meetings) {
        // 1. Delete recording files from disk
        const filePaths = [
          meeting.data?.screenRecordingPath,
          meeting.data?.audioRecordingPath,
        ].filter(Boolean) as string[];

        for (const filePath of filePaths) {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              deletedFiles++;
            }
          } catch {
            // File may already be deleted or inaccessible
          }
        }

        // 2. Clean up the meeting's recording directory
        const meetingDir = path.join(storagePath, meeting.id);
        try {
          if (fs.existsSync(meetingDir)) {
            // Remove all files in the directory (in case there are temp files)
            const files = fs.readdirSync(meetingDir);
            for (const file of files) {
              try {
                fs.unlinkSync(path.join(meetingDir, file));
                deletedFiles++;
              } catch {
                // Ignore individual file errors
              }
            }
            fs.rmdirSync(meetingDir);
          }
        } catch {
          // Ignore directory cleanup errors
        }

        // 3. Delete transcript segments for this meeting
        const segmentResult = await this.transcriptSegmentsRepository.delete({
          meetingId: meeting.id,
        });
        deletedSegments += segmentResult.affected || 0;

        // 4. Delete the meeting row itself
        await this.meetingsRepository.remove(meeting);
        deletedMeetings++;
      }

      this.logger.log(
        `Cleanup complete: deleted ${deletedMeetings} meeting(s), ` +
        `${deletedSegments} transcript segment(s), ` +
        `${deletedFiles} file(s) older than ${retentionDays} days`,
      );
    } catch (error: any) {
      this.logger.error(`Cleanup failed: ${error.message}`);
    }
  }
}
