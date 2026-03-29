import {
  Controller,
  Post,
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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/create-webhook.dto';

@ApiTags('Webhooks')
@Controller('webhooks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new webhook' })
  @ApiResponse({ status: 201, description: 'Webhook created' })
  async create(
    @CurrentUser() user: any,
    @Body() createWebhookDto: CreateWebhookDto,
  ) {
    const webhook = await this.webhooksService.create(
      user.id,
      createWebhookDto,
    );

    return {
      id: webhook.id,
      url: webhook.url,
      name: webhook.name,
      events: webhook.events,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all webhooks for the current user' })
  @ApiResponse({ status: 200, description: 'Returns list of webhooks' })
  async list(@CurrentUser() user: any) {
    const webhooks = await this.webhooksService.findAllByUser(user.id);

    return webhooks.map((wh) => ({
      id: wh.id,
      url: wh.url,
      name: wh.name,
      events: wh.events,
      isActive: wh.isActive,
      lastTriggeredAt: wh.lastTriggeredAt,
      lastStatus: wh.lastStatus,
      lastError: wh.lastError,
      createdAt: wh.createdAt,
      updatedAt: wh.updatedAt,
    }));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a webhook' })
  @ApiResponse({ status: 200, description: 'Webhook updated' })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateWebhookDto: UpdateWebhookDto,
  ) {
    const webhook = await this.webhooksService.update(
      id,
      user.id,
      updateWebhookDto,
    );

    return {
      id: webhook.id,
      url: webhook.url,
      name: webhook.name,
      events: webhook.events,
      isActive: webhook.isActive,
      updatedAt: webhook.updatedAt,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a webhook' })
  @ApiResponse({ status: 200, description: 'Webhook deleted' })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  async delete(@CurrentUser() user: any, @Param('id') id: string) {
    await this.webhooksService.delete(id, user.id);
    return { message: 'Webhook deleted successfully' };
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Send a test webhook' })
  @ApiResponse({ status: 200, description: 'Test webhook sent' })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  async test(@CurrentUser() user: any, @Param('id') id: string) {
    const result = await this.webhooksService.testWebhook(id, user.id);
    return {
      message: result.success
        ? 'Test webhook sent successfully'
        : 'Test webhook failed',
      ...result,
    };
  }
}
