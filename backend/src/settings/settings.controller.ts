import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { BotAuthService } from './bot-auth.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@ApiTags('Settings')
@Controller('settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class SettingsController {
  constructor(
    private readonly usersService: UsersService,
    private readonly botAuthService: BotAuthService,
  ) {}

  // ---------------------------------------------------------------------------
  // General settings
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Bot authentication (auth.json)
  // ---------------------------------------------------------------------------

  @Get('bot-auth/status')
  @ApiOperation({ summary: 'Get bot authentication status' })
  @ApiResponse({ status: 200, description: 'Returns auth status' })
  async getBotAuthStatus(@CurrentUser() user: any) {
    return this.botAuthService.getAuthStatus(user.id);
  }

  @Post('bot-auth/upload')
  @ApiOperation({ summary: 'Upload auth.json file for bot authentication' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Auth file uploaded' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
      fileFilter: (_req, file, cb) => {
        // Accept JSON files
        if (
          file.mimetype === 'application/json' ||
          file.originalname.endsWith('.json')
        ) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only JSON files are accepted'), false);
        }
      },
    }),
  )
  async uploadBotAuth(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const content = file.buffer.toString('utf-8');
    this.botAuthService.saveAuthFile(user.id, content);

    return {
      message: 'Bot authentication file uploaded successfully',
      status: this.botAuthService.getAuthStatus(user.id),
    };
  }

  @Post('bot-auth/upload-json')
  @ApiOperation({ summary: 'Upload auth.json content as JSON body' })
  @ApiResponse({ status: 200, description: 'Auth file uploaded' })
  async uploadBotAuthJson(
    @CurrentUser() user: any,
    @Body() body: { content: string; email?: string },
  ) {
    if (!body.content) {
      throw new BadRequestException('No content provided');
    }

    this.botAuthService.saveAuthFile(user.id, body.content, body.email);

    return {
      message: 'Bot authentication file uploaded successfully',
      status: this.botAuthService.getAuthStatus(user.id),
    };
  }

  @Delete('bot-auth')
  @ApiOperation({ summary: 'Delete bot authentication file' })
  @ApiResponse({ status: 200, description: 'Auth file deleted' })
  async deleteBotAuth(@CurrentUser() user: any) {
    const deleted = this.botAuthService.deleteAuthFile(user.id);
    return {
      message: deleted
        ? 'Bot authentication removed'
        : 'No bot authentication file found',
      status: this.botAuthService.getAuthStatus(user.id),
    };
  }

  // ---------------------------------------------------------------------------
  // Google OAuth for bot authentication
  // ---------------------------------------------------------------------------

  @Get('bot-auth/oauth/config')
  @ApiOperation({ summary: 'Check if Google OAuth is configured' })
  @ApiResponse({ status: 200, description: 'OAuth configuration status' })
  async getOAuthConfig() {
    return {
      isConfigured: this.botAuthService.isOAuthConfigured(),
    };
  }

  @Get('bot-auth/oauth/url')
  @ApiOperation({ summary: 'Get Google OAuth authorization URL' })
  @ApiResponse({ status: 200, description: 'OAuth URL' })
  async getOAuthUrl(@CurrentUser() user: any) {
    // Use the user ID as state to link the callback to the correct user
    const state = Buffer.from(
      JSON.stringify({ userId: user.id, ts: Date.now() }),
    ).toString('base64url');

    const url = this.botAuthService.getOAuthUrl(state);
    return { url, state };
  }

  @Post('bot-auth/oauth/callback')
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  @ApiResponse({ status: 200, description: 'OAuth completed' })
  async handleOAuthCallback(
    @CurrentUser() user: any,
    @Body() body: { code: string; state?: string },
  ) {
    if (!body.code) {
      throw new BadRequestException('Authorization code is required');
    }

    const result = await this.botAuthService.handleOAuthCallback(
      user.id,
      body.code,
    );

    return {
      message: `Google account (${result.email}) connected successfully`,
      email: result.email,
      status: this.botAuthService.getAuthStatus(user.id),
    };
  }
}
