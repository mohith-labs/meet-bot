import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
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
    description: 'Returns meetings for the authenticated user with optional pagination, filtering, and search.',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by meeting status' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by meeting ID or bot name' })
  @ApiResponse({ status: 200, description: 'Returns paginated list of meetings' })
  async listMeetings(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const result = await this.meetingsService.listByUserPaginated(
      user.id,
      pageNum,
      limitNum,
      status || undefined,
      search || undefined,
    );

    return {
      meetings: result.meetings.map((meeting) => ({
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
      })),
      meta: result.meta,
    };
  }

  @Get('detail/:id/recording/:type')
  @ApiOperation({
    summary: 'Download a meeting recording',
    description: 'Returns the screen or audio recording file for a specific meeting.',
  })
  @ApiParam({ name: 'id', description: 'Meeting UUID' })
  @ApiParam({ name: 'type', enum: ['screen', 'audio'], description: 'Recording type' })
  @ApiResponse({ status: 200, description: 'Returns the recording file' })
  @ApiResponse({ status: 404, description: 'Recording not found' })
  async getRecording(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('type') type: string,
    @Res() res: Response,
  ) {
    if (type !== 'screen' && type !== 'audio') {
      throw new NotFoundException('Invalid recording type. Use "screen" or "audio".');
    }

    const meeting = await this.meetingsService.findByIdForUser(user.id, id);
    const pathKey = type === 'screen' ? 'screenRecordingPath' : 'audioRecordingPath';
    const filePath = meeting.data?.[pathKey];

    if (!filePath || !fs.existsSync(filePath)) {
      throw new NotFoundException('Recording not found');
    }

    const filename = `${type}-recording-${id}.webm`;
    res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(path.resolve(filePath));
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
