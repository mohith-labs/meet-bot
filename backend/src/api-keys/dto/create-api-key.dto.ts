import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({
    example: 'My Bot Key',
    description: 'A friendly name for this API key',
  })
  @IsString()
  @IsNotEmpty()
  name: string;
}
