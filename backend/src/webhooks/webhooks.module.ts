import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Webhook } from '../entities/webhook.entity';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WebhookDispatcherService } from './webhook-dispatcher.service';

@Module({
  imports: [TypeOrmModule.forFeature([Webhook])],
  providers: [WebhooksService, WebhookDispatcherService],
  controllers: [WebhooksController],
  exports: [WebhookDispatcherService],
})
export class WebhooksModule {}
