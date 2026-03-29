import {
  Controller,
  Post,
  Get,
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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('API Keys')
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  @ApiResponse({
    status: 201,
    description: 'API key created. The raw key is only shown once.',
  })
  async create(
    @CurrentUser() user: any,
    @Body() createApiKeyDto: CreateApiKeyDto,
  ) {
    const { apiKey, rawKey } = await this.apiKeysService.create(
      user.id,
      createApiKeyDto.name,
    );

    return {
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,
      isActive: apiKey.isActive,
      createdAt: apiKey.createdAt,
      message: 'Store this key securely. It will not be shown again.',
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys for the current user' })
  @ApiResponse({ status: 200, description: 'Returns list of API keys' })
  async list(@CurrentUser() user: any) {
    const keys = await this.apiKeysService.listByUser(user.id);

    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.key.substring(0, 8) + '...',
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
    }));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiResponse({ status: 200, description: 'API key revoked' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async revoke(@CurrentUser() user: any, @Param('id') id: string) {
    await this.apiKeysService.revoke(id, user.id);
    return { message: 'API key revoked successfully' };
  }
}
