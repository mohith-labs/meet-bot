import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MeetingPlatform } from '../../entities/meeting.entity';

export class CreateBotDto {
  @ApiProperty({
    enum: MeetingPlatform,
    example: MeetingPlatform.GOOGLE_MEET,
    description: 'Meeting platform',
  })
  @IsEnum(MeetingPlatform)
  @IsNotEmpty()
  platform: MeetingPlatform;

  @ApiProperty({
    example: 'abc-defg-hij',
    description: 'Native meeting ID from the platform (e.g., Google Meet code)',
  })
  @IsString()
  @IsNotEmpty()
  nativeMeetingId: string;

  @ApiPropertyOptional({
    example: 'Meeting Bot',
    description: 'Display name for the bot in the meeting',
  })
  @IsString()
  @IsOptional()
  botName?: string;

  @ApiPropertyOptional({
    example: 'en',
    description: 'Language for transcription (default: en)',
  })
  @IsString()
  @IsOptional()
  language?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether to record the meeting',
  })
  @IsBoolean()
  @IsOptional()
  recordingEnabled?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether to transcribe the meeting',
  })
  @IsBoolean()
  @IsOptional()
  transcribeEnabled?: boolean;
}

export class UpdateBotConfigDto {
  @ApiPropertyOptional({ example: 'en', description: 'Language for transcription' })
  @IsString()
  @IsOptional()
  language?: string;

  @ApiPropertyOptional({ example: true, description: 'Whether recording is enabled' })
  @IsBoolean()
  @IsOptional()
  recordingEnabled?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Whether transcription is enabled' })
  @IsBoolean()
  @IsOptional()
  transcribeEnabled?: boolean;
}
