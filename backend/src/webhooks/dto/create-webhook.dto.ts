import {
  IsString,
  IsUrl,
  IsOptional,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://example.com/webhook' })
  @IsUrl()
  url: string;

  @ApiProperty({ required: false, example: 'My Webhook' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, example: 'whsec_mysecret' })
  @IsOptional()
  @IsString()
  secret?: string;

  @ApiProperty({
    required: false,
    example: [{ key: 'X-Custom', value: 'value' }],
  })
  @IsOptional()
  @IsArray()
  headers?: Array<{ key: string; value: string }>;

  @ApiProperty({
    required: false,
    example: ['meeting.started', 'meeting.ended'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];
}

export class UpdateWebhookDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  secret?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  headers?: Array<{ key: string; value: string }>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
