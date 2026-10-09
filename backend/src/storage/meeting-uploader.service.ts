import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { Meeting, MeetingStatus } from '../entities/meeting.entity';
import { TranscriptSegment } from '../entities/transcript-segment.entity';
import {
  MeetingUpload,
  UploadStatus,
  UploadedArtifact,
} from '../entities/meeting-upload.entity';
import { StorageConfig } from '../entities/storage-config.entity';
import { StorageConfigService } from './storage-config.service';
import { S3ClientService } from './s3-client.service';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { buildMeetingFolderKey, buildObjectKey } from './object-key.util';
import {
  buildTranscriptJson,
  buildTranscriptText,
  buildTranscriptVtt,
  buildTranscriptMarkdown,
} from './transcript-formatter.util';
import { resolveStoragePath } from '../config/storage.config';

/**
 * Uploads a finished meeting's artifacts to the user's S3-compatible bucket.
 *
 * Folder layout:
 *   <prefix>/<YYYY-MM-DD>/<HH-mm-ss>_<title-slug>_<shortId>/
 *     video.webm
 *     audio.webm
 *     transcript.json
 *     transcript.txt
 *     transcript.vtt
 *     transcript.md
 *     metadata.json
 */
@Injectable()
export class MeetingUploaderService {
  private readonly logger = new Logger(MeetingUploaderService.name);

  /** Guards against the same meeting being uploaded twice concurrently. */
  private readonly inFlight = new Set<string>();

  private readonly MAX_ATTEMPTS = 3;
  private readonly RETRY_BASE_DELAY_MS = 5_000;

  constructor(
    @InjectRepository(Meeting)
    private readonly meetingsRepository: Repository<Meeting>,
    @InjectRepository(TranscriptSegment)
    private readonly transcriptSegmentsRepository: Repository<TranscriptSegment>,
    @InjectRepository(MeetingUpload)
    private readonly uploadsRepository: Repository<MeetingUpload>,
    private readonly storageConfigService: StorageConfigService,
    private readonly s3ClientService: S3ClientService,
    private readonly webhookDispatcher: WebhookDispatcherService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public entry points
  // ---------------------------------------------------------------------------

  /**
   * Fire-and-forget archival triggered when a meeting ends.
   * Never throws — a storage failure must not break the meeting lifecycle.
   */
  queueUpload(meetingId: string): void {
    this.uploadMeeting(meetingId).catch((error) =>
      this.logger.error(
        `Upload failed for meeting ${meetingId}: ${error.message}`,
        error.stack,
      ),
    );
  }

  /** Manual retry from the API. Throws when the meeting does not exist. */
  async retryUpload(userId: string, meetingId: string): Promise<MeetingUpload> {
    const meeting = await this.meetingsRepository.findOne({
      where: { id: meetingId, userId },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const existing = await this.findByMeetingId(meetingId);
    if (existing?.status === UploadStatus.UPLOADING) {
      return existing;
    }

    // Reset the attempt counter so a manual retry gets a fresh budget.
    if (existing) {
      existing.attempts = 0;
      existing.lastError = null;
      existing.status = UploadStatus.PENDING;
      await this.uploadsRepository.save(existing);
    }

    await this.uploadMeeting(meetingId);
    return this.findByMeetingId(meetingId);
  }

  async findByMeetingId(meetingId: string): Promise<MeetingUpload | null> {
    return this.uploadsRepository.findOne({ where: { meetingId } });
  }

  async listByUser(userId: string, limit = 50): Promise<MeetingUpload[]> {
    return this.uploadsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Presigned download URL for one archived artifact.
   */
  async getArtifactUrl(
    userId: string,
    meetingId: string,
    artifactName: string,
    expiresInSeconds = 3600,
  ): Promise<{ url: string; key: string; expiresIn: number }> {
    const upload = await this.uploadsRepository.findOne({
      where: { meetingId, userId },
    });

    if (!upload || upload.status !== UploadStatus.COMPLETED) {
      throw new NotFoundException('No completed upload found for this meeting');
    }

    const artifact = (upload.artifacts || []).find(
      (a) => a.name === artifactName,
    );
    if (!artifact) {
      throw new NotFoundException(
        `Artifact "${artifactName}" not found in this upload`,
      );
    }

    const resolved = await this.storageConfigService.resolveCredentials(userId);
    if (!resolved) {
      throw new NotFoundException('Storage is no longer configured');
    }

    const client = this.s3ClientService.createClient(resolved.creds);
    try {
      const url = await this.s3ClientService.getPresignedUrl(
        client,
        upload.bucket,
        artifact.key,
        expiresInSeconds,
      );
      return { url, key: artifact.key, expiresIn: expiresInSeconds };
    } finally {
      client.destroy();
    }
  }

  // ---------------------------------------------------------------------------
  // Core upload
  // ---------------------------------------------------------------------------

  async uploadMeeting(meetingId: string): Promise<void> {
    if (this.inFlight.has(meetingId)) {
      this.logger.debug(`Upload already in flight for ${meetingId} — skipping`);
      return;
    }

    this.inFlight.add(meetingId);
    try {
      await this.doUploadMeeting(meetingId);
    } finally {
      this.inFlight.delete(meetingId);
    }
  }

  private async doUploadMeeting(meetingId: string): Promise<void> {
    const meeting = await this.meetingsRepository.findOne({
      where: { id: meetingId },
    });

    if (!meeting) {
      this.logger.warn(`Upload skipped: meeting ${meetingId} not found`);
      return;
    }

    const resolved = await this.storageConfigService.resolveCredentials(
      meeting.userId,
    );

    // No credentials or uploads disabled => record why, then stop.
    if (!resolved || !resolved.config.isEnabled) {
      await this.recordSkipped(
        meeting,
        !resolved
          ? 'S3 storage is not configured for this user'
          : 'S3 uploads are disabled for this user',
      );
      return;
    }

    const { config, creds } = resolved;

    if (meeting.status === MeetingStatus.FAILED && !config.uploadOnFailed) {
      await this.recordSkipped(
        meeting,
        'Meeting failed and uploadOnFailed is disabled',
      );
      return;
    }

    const upload = await this.getOrCreateUpload(meeting);

    if (upload.status === UploadStatus.COMPLETED) {
      this.logger.debug(`Meeting ${meetingId} already uploaded — skipping`);
      return;
    }

    if (upload.attempts >= this.MAX_ATTEMPTS) {
      this.logger.warn(
        `Meeting ${meetingId} reached max upload attempts (${this.MAX_ATTEMPTS})`,
      );
      return;
    }

    const segments = await this.transcriptSegmentsRepository.find({
      where: { meetingId },
      order: { startTime: 'ASC' },
    });

    // Folder name uses the meeting start (fall back to end time, then now).
    const folderKey = buildMeetingFolderKey({
      prefix: config.prefix,
      startedAt: meeting.startTime || meeting.endTime || new Date(),
      title: meeting.title,
      meetingId: meeting.id,
      timezone: config.timezone,
    });

    upload.status = UploadStatus.UPLOADING;
    upload.bucket = config.bucket;
    upload.folderKey = folderKey;
    upload.startedAt = new Date();
    upload.attempts += 1;
    await this.uploadsRepository.save(upload);

    this.logger.log(
      `Uploading meeting ${meetingId} to s3://${config.bucket}/${folderKey}/`,
    );

    const client = this.s3ClientService.createClient(creds);
    const artifacts: UploadedArtifact[] = [];

    try {
      const objectMetadata = {
        'meeting-id': meeting.id,
        'native-meeting-id': meeting.nativeMeetingId || '',
        'meeting-title': meeting.title || '',
        platform: meeting.platform || '',
      };

      // ── 1. Recordings (streamed from disk) ──────────────────────────
      const recordingTargets: Array<{
        name: string;
        filePath?: string;
        fileName: string;
        contentType: string;
      }> = [
        {
          name: 'video',
          filePath: meeting.data?.screenRecordingPath,
          fileName: 'video.webm',
          contentType: 'video/webm',
        },
        {
          name: 'audio',
          filePath: meeting.data?.audioRecordingPath,
          fileName: 'audio.webm',
          contentType: 'audio/webm',
        },
      ];

      for (const target of recordingTargets) {
        if (!target.filePath) continue;
        if (!fs.existsSync(target.filePath)) {
          this.logger.warn(
            `Recording missing on disk, skipping: ${target.filePath}`,
          );
          continue;
        }
        if (fs.statSync(target.filePath).size === 0) {
          this.logger.warn(`Recording is empty, skipping: ${target.filePath}`);
          continue;
        }

        const key = buildObjectKey(folderKey, target.fileName);
        const size = await this.s3ClientService.uploadFile(
          client,
          config.bucket,
          key,
          target.filePath,
          target.contentType,
          objectMetadata,
        );

        artifacts.push({
          name: target.name,
          key,
          size,
          contentType: target.contentType,
        });
        this.logger.log(
          `Uploaded ${target.fileName} (${this.formatBytes(size)}) → ${key}`,
        );
      }

      // ── 2. Transcripts (only when there is something to write) ──────
      if (segments.length > 0) {
        const transcriptFiles: Array<{
          name: string;
          fileName: string;
          content: string;
          contentType: string;
        }> = [
          {
            name: 'transcript.json',
            fileName: 'transcript.json',
            content: buildTranscriptJson(meeting, segments),
            contentType: 'application/json',
          },
          {
            name: 'transcript.txt',
            fileName: 'transcript.txt',
            content: buildTranscriptText(meeting, segments),
            contentType: 'text/plain; charset=utf-8',
          },
          {
            name: 'transcript.vtt',
            fileName: 'transcript.vtt',
            content: buildTranscriptVtt(segments),
            contentType: 'text/vtt; charset=utf-8',
          },
          {
            name: 'transcript.md',
            fileName: 'transcript.md',
            content: buildTranscriptMarkdown(meeting, segments),
            contentType: 'text/markdown; charset=utf-8',
          },
        ];

        for (const file of transcriptFiles) {
          const key = buildObjectKey(folderKey, file.fileName);
          const size = await this.s3ClientService.uploadBuffer(
            client,
            config.bucket,
            key,
            file.content,
            file.contentType,
            objectMetadata,
          );
          artifacts.push({
            name: file.name,
            key,
            size,
            contentType: file.contentType,
          });
        }
        this.logger.log(
          `Uploaded 4 transcript formats (${segments.length} segments)`,
        );
      } else {
        this.logger.log(`No transcript segments for ${meetingId}`);
      }

      // ── 3. metadata.json (always written — describes the archive) ───
      const metadataKey = buildObjectKey(folderKey, 'metadata.json');
      const metadataContent = this.buildMetadata(
        meeting,
        segments.length,
        artifacts,
        folderKey,
        config,
      );
      const metadataSize = await this.s3ClientService.uploadBuffer(
        client,
        config.bucket,
        metadataKey,
        metadataContent,
        'application/json',
        objectMetadata,
      );
      artifacts.push({
        name: 'metadata.json',
        key: metadataKey,
        size: metadataSize,
        contentType: 'application/json',
      });

      // ── 4. Mark complete ────────────────────────────────────────────
      const totalBytes = artifacts.reduce((sum, a) => sum + a.size, 0);

      upload.status = UploadStatus.COMPLETED;
      upload.artifacts = artifacts;
      upload.totalBytes = totalBytes;
      upload.completedAt = new Date();
      upload.lastError = null;
      await this.uploadsRepository.save(upload);

      this.logger.log(
        `Upload complete for ${meetingId}: ${artifacts.length} object(s), ` +
          `${this.formatBytes(totalBytes)} → s3://${config.bucket}/${folderKey}/`,
      );

      // ── 5. Delete local recordings (S3 is now the source of truth) ──
      if (config.deleteLocalAfterUpload) {
        const deleted = await this.deleteLocalRecordings(meeting);
        if (deleted) {
          upload.localFilesDeleted = true;
          await this.uploadsRepository.save(upload);
        }
      }

      // ── 6. Notify subscribers ───────────────────────────────────────
      this.webhookDispatcher.dispatch(meeting.userId, 'meeting.uploaded', {
        meetingId: meeting.id,
        title: meeting.title || null,
        platform: meeting.platform,
        nativeMeetingId: meeting.nativeMeetingId,
        bucket: config.bucket,
        folderKey,
        totalBytes,
        artifacts: artifacts.map((a) => ({
          name: a.name,
          key: a.key,
          size: a.size,
        })),
        publicUrl: this.buildPublicUrl(config, folderKey),
        uploadedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      upload.status = UploadStatus.FAILED;
      upload.lastError = error?.message || 'Unknown upload error';
      upload.artifacts = artifacts; // keep a record of what did land
      await this.uploadsRepository.save(upload);

      this.logger.error(
        `Upload failed for ${meetingId} (attempt ${upload.attempts}/${this.MAX_ATTEMPTS}): ${upload.lastError}`,
      );

      this.webhookDispatcher.dispatch(meeting.userId, 'meeting.upload_failed', {
        meetingId: meeting.id,
        title: meeting.title || null,
        error: upload.lastError,
        attempt: upload.attempts,
        maxAttempts: this.MAX_ATTEMPTS,
      });

      // Exponential backoff retry while attempts remain.
      if (upload.attempts < this.MAX_ATTEMPTS) {
        const delay = this.RETRY_BASE_DELAY_MS * Math.pow(2, upload.attempts - 1);
        this.logger.log(
          `Retrying upload for ${meetingId} in ${Math.round(delay / 1000)}s`,
        );
        setTimeout(() => this.queueUpload(meetingId), delay).unref?.();
      }
    } finally {
      client.destroy();
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getOrCreateUpload(meeting: Meeting): Promise<MeetingUpload> {
    const existing = await this.findByMeetingId(meeting.id);
    if (existing) return existing;

    return this.uploadsRepository.save(
      this.uploadsRepository.create({
        meetingId: meeting.id,
        userId: meeting.userId,
        status: UploadStatus.PENDING,
        attempts: 0,
      }),
    );
  }

  private async recordSkipped(meeting: Meeting, reason: string): Promise<void> {
    this.logger.debug(`Upload skipped for ${meeting.id}: ${reason}`);

    const upload = await this.getOrCreateUpload(meeting);
    // Don't clobber a previously successful archive.
    if (upload.status === UploadStatus.COMPLETED) return;

    upload.status = UploadStatus.SKIPPED;
    upload.lastError = reason;
    await this.uploadsRepository.save(upload);
  }

  private buildMetadata(
    meeting: Meeting,
    segmentCount: number,
    artifacts: UploadedArtifact[],
    folderKey: string,
    config: StorageConfig,
  ): string {
    const durationMs =
      meeting.startTime && meeting.endTime
        ? meeting.endTime.getTime() - meeting.startTime.getTime()
        : null;

    return JSON.stringify(
      {
        meeting: {
          id: meeting.id,
          title: meeting.title || null,
          platform: meeting.platform,
          nativeMeetingId: meeting.nativeMeetingId,
          meetingUrl: meeting.constructedMeetingUrl || null,
          status: meeting.status,
          botName: meeting.data?.botName || null,
          startTime: meeting.startTime ? meeting.startTime.toISOString() : null,
          endTime: meeting.endTime ? meeting.endTime.toISOString() : null,
          durationSeconds: durationMs ? Math.round(durationMs / 1000) : null,
          createdAt: meeting.createdAt ? meeting.createdAt.toISOString() : null,
        },
        transcript: {
          segmentCount,
          formats: artifacts
            .filter((a) => a.name.startsWith('transcript'))
            .map((a) => a.name),
        },
        recordings: {
          video: artifacts.some((a) => a.name === 'video'),
          audio: artifacts.some((a) => a.name === 'audio'),
        },
        storage: {
          bucket: config.bucket,
          folderKey,
          region: config.region,
          endpoint: config.endpoint || 'aws-s3-default',
          timezone: config.timezone,
        },
        artifacts: artifacts.map((a) => ({
          name: a.name,
          key: a.key,
          size: a.size,
          contentType: a.contentType,
        })),
        archivedAt: new Date().toISOString(),
        generatedBy: 'MeetBot',
        schemaVersion: 1,
      },
      null,
      2,
    );
  }

  /**
   * Remove local recording files and the meeting's recording directory,
   * then clear the stale paths off the meeting row.
   */
  private async deleteLocalRecordings(meeting: Meeting): Promise<boolean> {
    const filePaths = [
      meeting.data?.screenRecordingPath,
      meeting.data?.audioRecordingPath,
    ].filter(Boolean) as string[];

    let deletedAny = false;

    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedAny = true;
          this.logger.log(`Deleted local recording: ${filePath}`);
        }
      } catch (error: any) {
        this.logger.warn(`Could not delete ${filePath}: ${error.message}`);
      }
    }

    // Remove the (now hopefully empty) per-meeting directory.
    try {
      const storagePath = resolveStoragePath(this.configService);
      const meetingDir = path.join(storagePath, meeting.id);
      if (fs.existsSync(meetingDir)) {
        fs.rmSync(meetingDir, { recursive: true, force: true });
      }
    } catch (error: any) {
      this.logger.warn(
        `Could not remove recording dir for ${meeting.id}: ${error.message}`,
      );
    }

    if (deletedAny) {
      // Point the meeting at S3 instead of dead local paths.
      const fresh = await this.meetingsRepository.findOne({
        where: { id: meeting.id },
      });
      if (fresh) {
        const data = { ...(fresh.data || {}) };
        delete data.screenRecordingPath;
        delete data.audioRecordingPath;
        data.recordingsArchivedToS3 = true;
        await this.meetingsRepository.update(meeting.id, { data });
      }
    }

    return deletedAny;
  }

  private buildPublicUrl(config: StorageConfig, folderKey: string): string | null {
    if (!config.publicBaseUrl) return null;
    return `${config.publicBaseUrl.replace(/\/+$/g, '')}/${folderKey}`;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}
