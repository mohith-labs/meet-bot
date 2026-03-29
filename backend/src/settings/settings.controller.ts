import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@ApiTags('Settings')
@Controller('settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class SettingsController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user settings' })
  @ApiResponse({ status: 200, description: 'Returns user settings' })
  async getSettings(@CurrentUser() user: any) {
    const fullUser = await this.usersService.findByIdOrFail(user.id);
    return {
      botAutoExitEnabled: fullUser.botAutoExitEnabled,
      botAutoExitMinutes: fullUser.botAutoExitMinutes,
      defaultBotName: fullUser.name || 'MeetBot',
    };
  }

  @Patch()
  @ApiOperation({ summary: 'Update user settings' })
  @ApiResponse({ status: 200, description: 'Settings updated' })
  async updateSettings(
    @CurrentUser() user: any,
    @Body() dto: UpdateSettingsDto,
  ) {
    await this.usersService.update(user.id, dto);
    return {
      message: 'Settings updated',
      ...dto,
    };
  }
}
