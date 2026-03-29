import { IsOptional, IsString, IsArray, ValidateNested, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class MeetingDataDto {
  @ApiPropertyOptional({ example: 'Sprint Planning', description: 'Meeting name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Discussed Q1 objectives', description: 'Meeting notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    example: ['Alice', 'Bob', 'Charlie'],
    description: 'List of participants',
  })
  @IsArray()
  @IsOptional()
  participants?: string[];
}

export class UpdateMeetingDto {
  @ApiPropertyOptional({
    type: MeetingDataDto,
    description: 'Meeting metadata (name, notes, participants)',
  })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => MeetingDataDto)
  data?: MeetingDataDto;
}
