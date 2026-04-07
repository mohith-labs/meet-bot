import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
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
import { MeetingsService } from './meetings.service';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { MeetingPlatform } from '../entities/meeting.entity';

@ApiTags('Meetings')
@Controller('meetings')
@UseGuards(CombinedAuthGuard)
@ApiBearerAuth('JWT-auth')
@ApiSecurity('api-key')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all meetings',
    description: 'Returns all meetings for the authenticated user.',
  })
  @ApiResponse({ status: 200, description: 'Returns list of meetings' })
  async listMeetings(@CurrentUser() user: any) {
    const meetings = await this.meetingsService.listByUser(user.id);
    return meetings.map((meeting) => ({
      id: meeting.id,
      platform: meeting.platform,
      nativeMeetingId: meeting.nativeMeetingId,
      constructedMeetingUrl: meeting.constructedMeetingUrl,
      status: meeting.status,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      data: meeting.data,
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
    }));
  }

  @Get('detail/:id')
  @ApiOperation({
    summary: 'Get meeting by UUID',
    description:
      'Returns meeting details for a specific meeting identified by its UUID. This avoids ambiguity when the same room code is reused across multiple meetings.',
  })
  @ApiParam({ name: 'id', description: 'Meeting UUID' })
  @ApiResponse({ status: 200, description: 'Returns meeting details' })
  @ApiResponse({ status: 404, description: 'Meeting not found' })
  async getMeetingById(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const meeting = await this.meetingsService.findByIdForUser(user.id, id);

    return {
      id: meeting.id,
      platform: meeting.platform,
      nativeMeetingId: meeting.nativeMeetingId,
      constructedMeetingUrl: meeting.constructedMeetingUrl,
      status: meeting.status,
      botContainerId: meeting.botContainerId,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      data: meeting.data,
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
    };
  }

  @Get(':platform/:nativeMeetingId')
  @ApiOperation({
    summary: 'Get meeting details',
    description:
      'Returns detailed information about a specific meeting, including transcript segments.',
  })
  @ApiParam({ name: 'platform', enum: MeetingPlatform })
  @ApiParam({ name: 'nativeMeetingId', example: 'abc-defg-hij' })
  @ApiResponse({ status: 200, description: 'Returns meeting details' })
  @ApiResponse({ status: 404, description: 'Meeting not found' })
  async getMeeting(
    @CurrentUser() user: any,
    @Param('platform') platform: MeetingPlatform,
    @Param('nativeMeetingId') nativeMeetingId: string,
  ) {
    const meeting = await this.meetingsService.findByPlatformAndId(
      user.id,
      platform,
      nativeMeetingId,
    );

    return {
      id: meeting.id,
      platform: meeting.platform,
      nativeMeetingId: meeting.nativeMeetingId,
      constructedMeetingUrl: meeting.constructedMeetingUrl,
      status: meeting.status,
      botContainerId: meeting.botContainerId,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      data: meeting.data,
      transcriptSegments: meeting.transcriptSegments?.map((seg) => ({
        id: seg.id,
        text: seg.text,
        speaker: seg.speaker,
        language: seg.language,
        startTime: seg.startTime,
        endTime: seg.endTime,
        absoluteStartTime: seg.absoluteStartTime,
        absoluteEndTime: seg.absoluteEndTime,
        completed: seg.completed,
        createdAt: seg.createdAt,
      })),
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
    };
  }

  @Patch(':platform/:nativeMeetingId')
  @ApiOperation({
    summary: 'Update meeting metadata',
    description:
      'Updates the meeting data (name, notes, participants) for a specific meeting.',
  })
  @ApiParam({ name: 'platform', enum: MeetingPlatform })
  @ApiParam({ name: 'nativeMeetingId', example: 'abc-defg-hij' })
  @ApiResponse({ status: 200, description: 'Meeting updated' })
  @ApiResponse({ status: 404, description: 'Meeting not found' })
  async updateMeeting(
    @CurrentUser() user: any,
    @Param('platform') platform: MeetingPlatform,
    @Param('nativeMeetingId') nativeMeetingId: string,
    @Body() updateDto: UpdateMeetingDto,
  ) {
    const meeting = await this.meetingsService.updateMeeting(
      user.id,
      platform,
      nativeMeetingId,
      updateDto,
    );

    return {
      id: meeting.id,
      platform: meeting.platform,
      nativeMeetingId: meeting.nativeMeetingId,
      status: meeting.status,
      data: meeting.data,
      updatedAt: meeting.updatedAt,
      message: 'Meeting updated successfully',
    };
  }

  @Delete(':platform/:nativeMeetingId')
  @ApiOperation({
    summary: 'Delete/anonymize a meeting',
    description:
      'Anonymizes meeting data and removes the meeting record. This action is irreversible.',
  })
  @ApiParam({ name: 'platform', enum: MeetingPlatform })
  @ApiParam({ name: 'nativeMeetingId', example: 'abc-defg-hij' })
  @ApiResponse({ status: 200, description: 'Meeting deleted' })
  @ApiResponse({ status: 404, description: 'Meeting not found' })
  async deleteMeeting(
    @CurrentUser() user: any,
    @Param('platform') platform: MeetingPlatform,
    @Param('nativeMeetingId') nativeMeetingId: string,
  ) {
    await this.meetingsService.deleteMeeting(user.id, platform, nativeMeetingId);
    return { message: 'Meeting deleted and data anonymized successfully' };
  }
}
