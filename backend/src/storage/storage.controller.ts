import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CombinedAuthGuard } from '../common/guards/combined-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StorageConfigService } from './storage-config.service';
import { MeetingUploaderService } from './meeting-uploader.service';
import {
  UpdateStorageConfigDto,
  TestStorageConfigDto,
} from './dto/update-storage-config.dto';

@ApiTags('Storage')
@Controller('storage')
@UseGuards(CombinedAuthGuard)
@ApiBearerAuth('JWT-auth')
export class StorageController {
  constructor(
    private readonly storageConfigService: StorageConfigService,
    private readonly meetingUploaderService: MeetingUploaderService,
  ) {}

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  @Get('config')
  @ApiOperation({ summary: 'Get the current user S3 storage configuration' })
  @ApiResponse({ status: 200, description: 'Storage configuration (secret never returned)' })
  async getConfig(@CurrentUser() user: any) {
    return this.storageConfigService.getSafeConfig(user.id);
  }

  @Patch('config')
  @ApiOperation({ summary: 'Create or update the S3 storage configuration' })
  @ApiResponse({ status: 200, description: 'Configuration saved' })
  async updateConfig(
    @CurrentUser() user: any,
    @Body() dto: UpdateStorageConfigDto,
  ) {
    const config = await this.storageConfigService.upsert(user.id, dto);
    return { message: 'Storage configuration saved', config };
  }

  @Delete('config')
  @ApiOperation({ summary: 'Delete the S3 storage configuration' })
  @ApiResponse({ status: 200, description: 'Configuration deleted' })
  async deleteConfig(@CurrentUser() user: any) {
    const deleted = await this.storageConfigService.remove(user.id);
    return {
      message: deleted
        ? 'Storage configuration deleted'
        : 'No storage configuration found',
    };
  }

  @Post('config/test')
  @ApiOperation({
    summary: 'Test the S3 connection',
    description:
      'Tests the supplied credentials, or the stored ones when the body is empty.',
  })
  @ApiResponse({ status: 200, description: 'Connection test result' })
  async testConnection(
    @CurrentUser() user: any,
    @Body() dto: TestStorageConfigDto,
  ) {
    return this.storageConfigService.testConnection(user.id, dto);
  }

  // ---------------------------------------------------------------------------
  // Uploads
  // ---------------------------------------------------------------------------

  @Get('uploads')
  @ApiOperation({ summary: 'List recent meeting uploads for the current user' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of uploads' })
  async listUploads(@CurrentUser() user: any, @Query('limit') limit?: string) {
    const parsed = Math.min(Math.max(parseInt(limit || '50', 10) || 50, 1), 200);
    return this.meetingUploaderService.listByUser(user.id, parsed);
  }

  @Get('uploads/:meetingId')
  @ApiOperation({ summary: 'Get the upload status for one meeting' })
  @ApiParam({ name: 'meetingId', description: 'Internal meeting UUID' })
  @ApiResponse({ status: 200, description: 'Upload status' })
  async getUpload(
    @CurrentUser() user: any,
    @Param('meetingId') meetingId: string,
  ) {
    const upload = await this.meetingUploaderService.findByMeetingId(meetingId);

    if (!upload || upload.userId !== user.id) {
      return { status: 'none', meetingId };
    }
    return upload;
  }

  @Post('uploads/:meetingId/retry')
  @ApiOperation({ summary: 'Retry (or start) the S3 upload for a meeting' })
  @ApiParam({ name: 'meetingId', description: 'Internal meeting UUID' })
  @ApiResponse({ status: 200, description: 'Upload retried' })
  async retryUpload(
    @CurrentUser() user: any,
    @Param('meetingId') meetingId: string,
  ) {
    const upload = await this.meetingUploaderService.retryUpload(
      user.id,
      meetingId,
    );
    return { message: 'Upload processed', upload };
  }

  @Get('uploads/:meetingId/download/:artifact')
  @ApiOperation({
    summary: 'Get a presigned download URL for an archived artifact',
    description:
      'artifact is one of: video, audio, transcript.json, transcript.txt, transcript.vtt, transcript.md, metadata.json',
  })
  @ApiParam({ name: 'meetingId', description: 'Internal meeting UUID' })
  @ApiParam({ name: 'artifact', description: 'Artifact name' })
  @ApiQuery({ name: 'expiresIn', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Presigned URL' })
  async getArtifactUrl(
    @CurrentUser() user: any,
    @Param('meetingId') meetingId: string,
    @Param('artifact') artifact: string,
    @Query('expiresIn') expiresIn?: string,
  ) {
    const parsed = Math.min(
      Math.max(parseInt(expiresIn || '3600', 10) || 3600, 60),
      7 * 24 * 3600,
    );
    return this.meetingUploaderService.getArtifactUrl(
      user.id,
      meetingId,
      artifact,
      parsed,
    );
  }
}
