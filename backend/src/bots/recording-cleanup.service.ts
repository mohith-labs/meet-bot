import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { AppSettings } from '../entities/app-settings.entity';
import { Meeting } from '../entities/meeting.entity';
import { resolveStoragePath } from '../config/storage.config';

@Injectable()
export class RecordingCleanupService implements OnModuleInit {
  private readonly logger = new Logger(RecordingCleanupService.name);

  constructor(
    @InjectRepository(AppSettings)
    private readonly appSettingsRepository: Repository<AppSettings>,
    @InjectRepository(Meeting)
    private readonly meetingsRepository: Repository<Meeting>,
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
      const retentionDays = parseInt(setting?.value || '30', 10);
      if (retentionDays <= 0) {
        this.logger.debug('Recording retention is 0 (keep forever) — skipping cleanup');
        return;
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const storagePath = resolveStoragePath(this.configService);

      // Find completed meetings older than the cutoff that still have recording paths
      const meetings = await this.meetingsRepository
        .createQueryBuilder('meeting')
        .where('meeting.endTime < :cutoff', { cutoff: cutoffDate.toISOString() })
        .andWhere(
          "(meeting.data LIKE '%screenRecordingPath%' OR meeting.data LIKE '%audioRecordingPath%')",
        )
        .getMany();

      if (meetings.length === 0) return;

      let deletedFiles = 0;
      for (const meeting of meetings) {
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

        // Clean up the meeting's recording directory if empty
        const meetingDir = path.join(storagePath, meeting.id);
        try {
          if (fs.existsSync(meetingDir)) {
            const remaining = fs.readdirSync(meetingDir);
            if (remaining.length === 0) {
              fs.rmdirSync(meetingDir);
            }
          }
        } catch {
          // Ignore directory cleanup errors
        }

        // Remove recording paths from meeting data
        const updatedData = { ...meeting.data };
        delete updatedData.screenRecordingPath;
        delete updatedData.audioRecordingPath;
        await this.meetingsRepository.update(meeting.id, { data: updatedData });
      }

      if (deletedFiles > 0) {
        this.logger.log(
          `Recording cleanup: deleted ${deletedFiles} file(s) from ${meetings.length} meeting(s) older than ${retentionDays} days`,
        );
      }
    } catch (error: any) {
      this.logger.error(`Recording cleanup failed: ${error.message}`);
    }
  }
}
