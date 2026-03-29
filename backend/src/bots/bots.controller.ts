import {
  Controller,
  Post,
  Get,
  Delete,
  Put,
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
import { BotsService } from './bots.service';
import { CreateBotDto, UpdateBotConfigDto } from './dto/create-bot.dto';
import { MeetingPlatform } from '../entities/meeting.entity';

@ApiTags('Bots')
@Controller('bots')
@UseGuards(CombinedAuthGuard)
@ApiBearerAuth('JWT-auth')
@ApiSecurity('api-key')
export class BotsController {
  constructor(private readonly botsService: BotsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a bot to join a meeting',
    description:
      'Creates and starts a bot that joins the specified meeting. The bot will begin transcribing once active.',
  })
  @ApiResponse({ status: 201, description: 'Bot created and joining meeting' })
  @ApiResponse({ status: 400, description: 'Bot already active for this meeting' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createBot(
    @CurrentUser() user: any,
    @Body() createBotDto: CreateBotDto,
  ) {
    const meeting = await this.botsService.createBot(user.id, createBotDto);
    return {
      meetingId: meeting.id,
      platform: meeting.platform,
      nativeMeetingId: meeting.nativeMeetingId,
      constructedMeetingUrl: meeting.constructedMeetingUrl,
      status: meeting.status,
      botContainerId: meeting.botContainerId,
      data: meeting.data,
      createdAt: meeting.createdAt,
    };
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get status of all running bots',
    description: 'Returns a list of all active or pending bots for the current user.',
  })
  @ApiResponse({ status: 200, description: 'Returns list of running bots' })
  async getBotStatus(@CurrentUser() user: any) {
    const meetings = await this.botsService.getBotStatus(user.id);
    return meetings.map((meeting) => ({
      meetingId: meeting.id,
      platform: meeting.platform,
      nativeMeetingId: meeting.nativeMeetingId,
      constructedMeetingUrl: meeting.constructedMeetingUrl,
      status: meeting.status,
      botContainerId: meeting.botContainerId,
      startTime: meeting.startTime,
      data: meeting.data,
      createdAt: meeting.createdAt,
    }));
  }

  @Delete(':platform/:nativeMeetingId')
  @ApiOperation({
    summary: 'Stop a bot',
    description: 'Stops the bot for the specified meeting and finalizes the transcript.',
  })
  @ApiParam({ name: 'platform', enum: MeetingPlatform })
  @ApiParam({ name: 'nativeMeetingId', example: 'abc-defg-hij' })
  @ApiResponse({ status: 200, description: 'Bot stopped successfully' })
  @ApiResponse({ status: 404, description: 'No active bot found' })
  async stopBot(
    @CurrentUser() user: any,
    @Param('platform') platform: MeetingPlatform,
    @Param('nativeMeetingId') nativeMeetingId: string,
  ) {
    const meeting = await this.botsService.stopBot(
      user.id,
      platform,
      nativeMeetingId,
    );
    return {
      meetingId: meeting.id,
      platform: meeting.platform,
      nativeMeetingId: meeting.nativeMeetingId,
      status: meeting.status,
      endTime: meeting.endTime,
      message: 'Bot stopped successfully',
    };
  }

  @Put(':platform/:nativeMeetingId/config')
  @ApiOperation({
    summary: 'Update bot configuration',
    description:
      'Updates the configuration of an active bot (language, recording, transcription settings).',
  })
  @ApiParam({ name: 'platform', enum: MeetingPlatform })
  @ApiParam({ name: 'nativeMeetingId', example: 'abc-defg-hij' })
  @ApiResponse({ status: 200, description: 'Bot configuration updated' })
  @ApiResponse({ status: 404, description: 'No active bot found' })
  async updateBotConfig(
    @CurrentUser() user: any,
    @Param('platform') platform: MeetingPlatform,
    @Param('nativeMeetingId') nativeMeetingId: string,
    @Body() updateDto: UpdateBotConfigDto,
  ) {
    const meeting = await this.botsService.updateBotConfig(
      user.id,
      platform,
      nativeMeetingId,
      updateDto,
    );
    return {
      meetingId: meeting.id,
      platform: meeting.platform,
      nativeMeetingId: meeting.nativeMeetingId,
      status: meeting.status,
      data: meeting.data,
      message: 'Bot configuration updated',
    };
  }
}
