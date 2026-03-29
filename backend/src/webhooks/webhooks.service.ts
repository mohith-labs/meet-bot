import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Webhook } from '../entities/webhook.entity';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/create-webhook.dto';
import { WebhookDispatcherService } from './webhook-dispatcher.service';

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(Webhook)
    private readonly webhooksRepository: Repository<Webhook>,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {}

  async create(userId: string, dto: CreateWebhookDto): Promise<Webhook> {
    const webhook = this.webhooksRepository.create({
      userId,
      url: dto.url,
      name: dto.name || '',
      secret: dto.secret,
      headers: dto.headers || [],
      events: dto.events || ['meeting.started', 'meeting.ended'],
      isActive: true,
    });

    return this.webhooksRepository.save(webhook);
  }

  async findAllByUser(userId: string): Promise<Webhook[]> {
    return this.webhooksRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string, userId: string): Promise<Webhook> {
    const webhook = await this.webhooksRepository.findOne({
      where: { id, userId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    return webhook;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateWebhookDto,
  ): Promise<Webhook> {
    const webhook = await this.findById(id, userId);

    if (dto.url !== undefined) webhook.url = dto.url;
    if (dto.name !== undefined) webhook.name = dto.name;
    if (dto.secret !== undefined) webhook.secret = dto.secret;
    if (dto.headers !== undefined) webhook.headers = dto.headers;
    if (dto.events !== undefined) webhook.events = dto.events;
    if (dto.isActive !== undefined) webhook.isActive = dto.isActive;

    return this.webhooksRepository.save(webhook);
  }

  async delete(id: string, userId: string): Promise<void> {
    const webhook = await this.findById(id, userId);
    await this.webhooksRepository.remove(webhook);
  }

  async testWebhook(
    id: string,
    userId: string,
  ): Promise<{ success: boolean; status?: number; error?: string }> {
    const webhook = await this.findById(id, userId);
    return this.webhookDispatcher.sendTest(webhook);
  }
}
