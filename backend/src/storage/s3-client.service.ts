import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';
import { StorageConfig } from '../entities/storage-config.entity';

export interface ResolvedS3Credentials {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/**
 * Thin wrapper around the AWS SDK that works with any S3-compatible provider
 * (AWS S3, Cloudflare R2, MinIO, Backblaze B2, Wasabi, DigitalOcean Spaces).
 */
@Injectable()
export class S3ClientService {
  private readonly logger = new Logger(S3ClientService.name);

  /** Build a client for the given resolved credentials. */
  createClient(creds: ResolvedS3Credentials): S3Client {
    return new S3Client({
      region: creds.region || 'us-east-1',
      // Only set endpoint for non-AWS providers; empty => default AWS endpoints.
      ...(creds.endpoint ? { endpoint: creds.endpoint } : {}),
      forcePathStyle: creds.forcePathStyle,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
      },
      maxAttempts: 3,
    });
  }

  /**
   * Verify the credentials and that the bucket is reachable.
   * Returns a structured result instead of throwing so the UI can show the reason.
   */
  async testConnection(
    creds: ResolvedS3Credentials,
  ): Promise<{ success: boolean; error?: string }> {
    let client: S3Client | null = null;

    try {
      client = this.createClient(creds);
      await client.send(new HeadBucketCommand({ Bucket: creds.bucket }));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: this.describeError(error, creds.bucket) };
    } finally {
      client?.destroy();
    }
  }

  /**
   * Stream a file from disk to S3 using a multipart upload.
   * Streaming keeps memory flat for multi-GB screen recordings.
   */
  async uploadFile(
    client: S3Client,
    bucket: string,
    key: string,
    filePath: string,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<number> {
    const stats = fs.statSync(filePath);
    const body = fs.createReadStream(filePath);

    try {
      const upload = new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ...(metadata ? { Metadata: this.sanitizeMetadata(metadata) } : {}),
        },
        // 8 MB parts, 4 concurrent — sane for large recordings on modest hosts.
        partSize: 8 * 1024 * 1024,
        queueSize: 4,
      });

      await upload.done();
      return stats.size;
    } finally {
      body.destroy();
    }
  }

  /** Upload an in-memory buffer/string (transcripts, metadata). */
  async uploadBuffer(
    client: S3Client,
    bucket: string,
    key: string,
    content: string | Buffer,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<number> {
    const body = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(metadata ? { Metadata: this.sanitizeMetadata(metadata) } : {}),
      }),
    );

    return body.length;
  }

  /** Generate a time-limited download URL for an archived object. */
  async getPresignedUrl(
    client: S3Client,
    bucket: string,
    key: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  /** Best-effort delete, used to roll back a partial upload. */
  async deleteObject(
    client: S3Client,
    bucket: string,
    key: string,
  ): Promise<void> {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error: any) {
      this.logger.warn(`Failed to delete ${key}: ${error.message}`);
    }
  }

  /**
   * S3 object metadata must be US-ASCII header-safe.
   * Strip anything else so a unicode meeting title can't break the request.
   */
  private sanitizeMetadata(
    metadata: Record<string, string>,
  ): Record<string, string> {
    const clean: Record<string, string> = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (value === undefined || value === null) continue;
      const safeValue = String(value)
        .replace(/[^\x20-\x7E]/g, '')
        .slice(0, 1024)
        .trim();
      if (safeValue) clean[key.toLowerCase()] = safeValue;
    }

    return clean;
  }

  /** Turn SDK errors into something a human can act on. */
  private describeError(error: any, bucket: string): string {
    const name = error?.name || error?.Code || '';
    const code = error?.$metadata?.httpStatusCode;

    if (name === 'NotFound' || code === 404) {
      return `Bucket "${bucket}" not found at this endpoint/region`;
    }
    if (name === 'Forbidden' || code === 403) {
      return 'Access denied — check the access key, secret key and bucket permissions';
    }
    if (name === 'InvalidAccessKeyId') {
      return 'Invalid access key ID';
    }
    if (name === 'SignatureDoesNotMatch') {
      return 'Signature mismatch — the secret access key is wrong';
    }
    if (name === 'PermanentRedirect' || name === 'AuthorizationHeaderMalformed') {
      return 'Wrong region for this bucket — check the region setting';
    }
    if (error?.code === 'ENOTFOUND' || error?.cause?.code === 'ENOTFOUND') {
      return 'Endpoint host could not be resolved — check the endpoint URL';
    }
    if (error?.code === 'ECONNREFUSED' || error?.cause?.code === 'ECONNREFUSED') {
      return 'Connection refused — is the endpoint reachable from the server?';
    }

    return error?.message || 'Unknown S3 error';
  }
}
