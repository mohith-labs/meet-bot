import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meeting } from '../entities/meeting.entity';
import { TranscriptSegment } from '../entities/transcript-segment.entity';
import { StorageConfig } from '../entities/storage-config.entity';
import { MeetingUpload } from '../entities/meeting-upload.entity';
import { StorageController } from './storage.controller';
import { StorageConfigService } from './storage-config.service';
import { MeetingUploaderService } from './meeting-uploader.service';
import { S3ClientService } from './s3-client.service';
import { AuthModule } from '../auth/auth.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Meeting,
      TranscriptSegment,
      StorageConfig,
      MeetingUpload,
    ]),
    AuthModule,
    WebhooksModule,
  ],
  controllers: [StorageController],
  providers: [StorageConfigService, MeetingUploaderService, S3ClientService],
  exports: [StorageConfigService, MeetingUploaderService, S3ClientService],
})
export class StorageModule {}
