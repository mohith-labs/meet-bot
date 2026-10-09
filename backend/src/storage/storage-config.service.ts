import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { StorageConfig } from '../entities/storage-config.entity';
import { UpdateStorageConfigDto } from './dto/update-storage-config.dto';
import { encryptSecret, decryptSecret, maskSecret } from './crypto.util';
import { S3ClientService, ResolvedS3Credentials } from './s3-client.service';

/** Shape returned to the client — never contains the secret key. */
export interface SafeStorageConfig {
  isEnabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  hasSecretAccessKey: boolean;
  secretAccessKeyMasked: string;
  forcePathStyle: boolean;
  prefix: string;
  timezone: string;
  deleteLocalAfterUpload: boolean;
  uploadOnFailed: boolean;
  publicBaseUrl: string;
  isConfigured: boolean;
  lastTestedAt: Date | null;
  lastTestError: string | null;
}

@Injectable()
export class StorageConfigService {
  private readonly logger = new Logger(StorageConfigService.name);

  constructor(
    @InjectRepository(StorageConfig)
    private readonly storageConfigRepository: Repository<StorageConfig>,
    private readonly configService: ConfigService,
    private readonly s3ClientService: S3ClientService,
  ) {}

  private get appSecret(): string {
    return this.configService.get<string>('JWT_SECRET', 'meetbot-default-secret');
  }

  /** Load the raw row for a user (null when never configured). */
  async findByUserId(userId: string): Promise<StorageConfig | null> {
    return this.storageConfigRepository.findOne({ where: { userId } });
  }

  /** Get the user's config in a client-safe shape, with defaults when unset. */
  async getSafeConfig(userId: string): Promise<SafeStorageConfig> {
    const config = await this.findByUserId(userId);

    if (!config) {
      return {
        isEnabled: false,
        endpoint: '',
        region: 'us-east-1',
        bucket: '',
        accessKeyId: '',
        hasSecretAccessKey: false,
        secretAccessKeyMasked: '',
        forcePathStyle: true,
        prefix: 'meetings',
        timezone: 'UTC',
        deleteLocalAfterUpload: true,
        uploadOnFailed: true,
        publicBaseUrl: '',
        isConfigured: false,
        lastTestedAt: null,
        lastTestError: null,
      };
    }

    return this.toSafeConfig(config);
  }

  private toSafeConfig(config: StorageConfig): SafeStorageConfig {
    const secret = decryptSecret(
      config.secretAccessKeyEncrypted,
      this.appSecret,
    );

    return {
      isEnabled: config.isEnabled,
      endpoint: config.endpoint,
      region: config.region,
      bucket: config.bucket,
      accessKeyId: config.accessKeyId,
      hasSecretAccessKey: !!secret,
      secretAccessKeyMasked: maskSecret(secret),
      forcePathStyle: config.forcePathStyle,
      prefix: config.prefix,
      timezone: config.timezone,
      deleteLocalAfterUpload: config.deleteLocalAfterUpload,
      uploadOnFailed: config.uploadOnFailed,
      publicBaseUrl: config.publicBaseUrl,
      isConfigured: this.isComplete(config, secret),
      lastTestedAt: config.lastTestedAt || null,
      lastTestError: config.lastTestError || null,
    };
  }

  private isComplete(config: StorageConfig, secret: string): boolean {
    return !!(config.bucket && config.accessKeyId && secret);
  }

  /**
   * Create or update the user's storage config.
   * An omitted/empty `secretAccessKey` keeps the stored secret unchanged, so the
   * UI can save other fields without re-typing it.
   */
  async upsert(
    userId: string,
    dto: UpdateStorageConfigDto,
  ): Promise<SafeStorageConfig> {
    let config = await this.findByUserId(userId);

    if (!config) {
      config = this.storageConfigRepository.create({
        userId,
        region: 'us-east-1',
        prefix: 'meetings',
        timezone: 'UTC',
        forcePathStyle: true,
        deleteLocalAfterUpload: true,
        uploadOnFailed: true,
      });
    }

    const assignable: Array<keyof UpdateStorageConfigDto> = [
      'isEnabled',
      'endpoint',
      'region',
      'bucket',
      'accessKeyId',
      'forcePathStyle',
      'prefix',
      'timezone',
      'deleteLocalAfterUpload',
      'uploadOnFailed',
      'publicBaseUrl',
    ];

    for (const field of assignable) {
      if (dto[field] !== undefined) {
        (config as any)[field] = dto[field];
      }
    }

    // Normalise the prefix: no leading/trailing slashes.
    if (dto.prefix !== undefined) {
      config.prefix = dto.prefix.replace(/^\/+|\/+$/g, '');
    }

    // Trim a trailing slash off the endpoint so key URLs don't double up.
    if (dto.endpoint !== undefined) {
      config.endpoint = dto.endpoint.replace(/\/+$/g, '');
    }

    if (dto.timezone !== undefined && dto.timezone !== '') {
      if (!this.isValidTimezone(dto.timezone)) {
        throw new BadRequestException(`Unknown timezone: ${dto.timezone}`);
      }
      config.timezone = dto.timezone;
    }

    // Only overwrite the secret when a new non-empty one is supplied.
    if (dto.secretAccessKey) {
      config.secretAccessKeyEncrypted = encryptSecret(
        dto.secretAccessKey,
        this.appSecret,
      );
      // Credentials changed — previous test result no longer applies.
      config.lastTestedAt = null;
      config.lastTestError = null;
    }

    // Refuse to enable an incomplete config — fail loudly at save time
    // instead of silently skipping every upload later.
    const effectiveSecret = decryptSecret(
      config.secretAccessKeyEncrypted,
      this.appSecret,
    );
    if (config.isEnabled && !this.isComplete(config, effectiveSecret)) {
      throw new BadRequestException(
        'Cannot enable uploads: bucket, access key ID and secret access key are all required',
      );
    }

    const saved = await this.storageConfigRepository.save(config);
    return this.toSafeConfig(saved);
  }

  /** Resolve decrypted credentials for use by the uploader. */
  async resolveCredentials(
    userId: string,
  ): Promise<{ config: StorageConfig; creds: ResolvedS3Credentials } | null> {
    const config = await this.findByUserId(userId);
    if (!config) return null;

    const secretAccessKey = decryptSecret(
      config.secretAccessKeyEncrypted,
      this.appSecret,
    );
    if (!this.isComplete(config, secretAccessKey)) return null;

    return {
      config,
      creds: {
        endpoint: config.endpoint,
        region: config.region || 'us-east-1',
        bucket: config.bucket,
        accessKeyId: config.accessKeyId,
        secretAccessKey,
        forcePathStyle: config.forcePathStyle,
      },
    };
  }

  /**
   * Test a connection. When `dto` carries a secret, that one is used (so the
   * UI can test before saving); otherwise the stored secret is used.
   */
  async testConnection(
    userId: string,
    dto?: UpdateStorageConfigDto,
  ): Promise<{ success: boolean; error?: string }> {
    const stored = await this.findByUserId(userId);
    const storedSecret = stored
      ? decryptSecret(stored.secretAccessKeyEncrypted, this.appSecret)
      : '';

    const creds: ResolvedS3Credentials = {
      endpoint: dto?.endpoint ?? stored?.endpoint ?? '',
      region: dto?.region ?? stored?.region ?? 'us-east-1',
      bucket: dto?.bucket ?? stored?.bucket ?? '',
      accessKeyId: dto?.accessKeyId ?? stored?.accessKeyId ?? '',
      secretAccessKey: dto?.secretAccessKey || storedSecret,
      forcePathStyle: dto?.forcePathStyle ?? stored?.forcePathStyle ?? true,
    };

    if (!creds.bucket || !creds.accessKeyId || !creds.secretAccessKey) {
      return {
        success: false,
        error: 'Bucket, access key ID and secret access key are required',
      };
    }

    const result = await this.s3ClientService.testConnection(creds);

    // Persist the outcome so the UI can show it after a reload.
    if (stored) {
      stored.lastTestedAt = new Date();
      stored.lastTestError = result.success ? null : result.error;
      await this.storageConfigRepository.save(stored);
    }

    return result;
  }

  /** Remove the stored config entirely. */
  async remove(userId: string): Promise<boolean> {
    const result = await this.storageConfigRepository.delete({ userId });
    return (result.affected || 0) > 0;
  }

  private isValidTimezone(timezone: string): boolean {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }
}
