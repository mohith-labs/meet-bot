import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
  ApiParam,
} from '@nestjs/swagger';
import { CombinedAuthGuard } from '../common/guards/combined-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TranscriptsService } from './transcripts.service';
import { MeetingPlatform } from '../entities/meeting.entity';

@ApiTags('Transcripts')
@Controller('transcripts')
@UseGuards(CombinedAuthGuard)
@ApiBearerAuth('JWT-auth')
@ApiSecurity('api-key')
export class TranscriptsController {
  constructor(private readonly transcriptsService: TranscriptsService) {}

  @Get(':platform/:nativeMeetingId')
  @ApiOperation({
    summary: 'Get transcript for a meeting',
    description:
      'Returns the full transcript (meeting metadata + all segments) for a specific meeting.',
  })
  @ApiParam({ name: 'platform', enum: MeetingPlatform })
  @ApiParam({ name: 'nativeMeetingId', example: 'abc-defg-hij' })
  @ApiResponse({
    status: 200,
    description: 'Returns transcript with meeting metadata and segments',
  })
  @ApiResponse({ status: 404, description: 'Meeting not found' })
  async getTranscript(
    @CurrentUser() user: any,
    @Param('platform') platform: MeetingPlatform,
    @Param('nativeMeetingId') nativeMeetingId: string,
  ) {
    return this.transcriptsService.getTranscript(
      user.id,
      platform,
      nativeMeetingId,
    );
  }

  @Post(':platform/:nativeMeetingId/share')
  @ApiOperation({
    summary: 'Share a transcript',
    description:
      'Generates a shareable link for the transcript. Anyone with the link can view it.',
  })
  @ApiParam({ name: 'platform', enum: MeetingPlatform })
  @ApiParam({ name: 'nativeMeetingId', example: 'abc-defg-hij' })
  @ApiResponse({ status: 201, description: 'Share link generated' })
  @ApiResponse({ status: 404, description: 'Meeting not found' })
  async shareTranscript(
    @CurrentUser() user: any,
    @Param('platform') platform: MeetingPlatform,
    @Param('nativeMeetingId') nativeMeetingId: string,
  ) {
    return this.transcriptsService.shareTranscript(
      user.id,
      platform,
      nativeMeetingId,
    );
  }
}
