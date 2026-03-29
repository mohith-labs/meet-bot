import { IsOptional, IsBoolean, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  botAutoExitEnabled?: boolean;

  @ApiProperty({
    required: false,
    example: 5,
    description: 'Minutes to wait before auto-exit when alone (0-30)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(30)
  botAutoExitMinutes?: number;
}
