import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateStorageConfigDto {
  @ApiPropertyOptional({ description: 'Enable automatic upload after a meeting ends' })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'S3-compatible endpoint URL. Leave empty for AWS S3. e.g. https://<account>.r2.cloudflarestorage.com',
    example: 'https://s3.us-west-002.backblazeb2.com',
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== '')
  // IsUrl with require_tld:false accepts bare hostnames like "not-a-url",
  // so require an explicit http(s):// scheme as well.
  @Matches(/^https?:\/\/[^\s]+$/i, {
    message: 'endpoint must be a valid http(s) URL',
  })
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] }, {
    message: 'endpoint must be a valid http(s) URL',
  })
  endpoint?: string;

  @ApiPropertyOptional({ example: 'us-east-1' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  region?: string;

  @ApiPropertyOptional({ example: 'meeting-archives' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]$/, {
    message:
      'bucket must be a valid S3 bucket name (lowercase letters, numbers, dots, hyphens)',
  })
  bucket?: string;

  @ApiPropertyOptional({ description: 'Access key ID' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  accessKeyId?: string;

  @ApiPropertyOptional({
    description: 'Secret access key — write-only, never returned by the API',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  secretAccessKey?: string;

  @ApiPropertyOptional({
    description: 'Use path-style addressing (required by MinIO and most non-AWS providers)',
  })
  @IsOptional()
  @IsBoolean()
  forcePathStyle?: boolean;

  @ApiPropertyOptional({
    description: 'Key prefix inside the bucket',
    example: 'meetings',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^[a-zA-Z0-9._\-\/]*$/, {
    message: 'prefix may only contain letters, numbers, dots, dashes, underscores and slashes',
  })
  prefix?: string;

  @ApiPropertyOptional({
    description: 'IANA timezone used for the date/time folder names',
    example: 'Asia/Kolkata',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Delete local recordings after a successful upload',
  })
  @IsOptional()
  @IsBoolean()
  deleteLocalAfterUpload?: boolean;

  @ApiPropertyOptional({
    description: 'Also upload meetings that ended in a failed state (partial data)',
  })
  @IsOptional()
  @IsBoolean()
  uploadOnFailed?: boolean;

  @ApiPropertyOptional({
    description: 'Public base URL for browsing objects (optional CDN in front of the bucket)',
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== '')
  @Matches(/^https?:\/\/[^\s]+$/i, {
    message: 'publicBaseUrl must be a valid http(s) URL',
  })
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] }, {
    message: 'publicBaseUrl must be a valid http(s) URL',
  })
  publicBaseUrl?: string;
}

export class TestStorageConfigDto extends UpdateStorageConfigDto {}
