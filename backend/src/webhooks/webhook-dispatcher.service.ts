import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Webhook } from '../entities/webhook.entity';
import * as crypto from 'crypto';

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, any>;
}

@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepository: Repository<Webhook>,
  ) {}

  /**
   * Dispatch webhooks for a specific user and event type.
   * Finds all active webhooks for the user that subscribe to the event,
   * then calls each one asynchronously.
   */
  async dispatch(
    userId: string,
    event: string,
    data: Record<string, any>,
  ): Promise<void> {
    const webhooks = await this.webhookRepository.find({
      where: { userId, isActive: true },
    });

    const matching = webhooks.filter(
      (wh) => wh.events.includes(event) || wh.events.includes('*'),
    );

    if (matching.length === 0) return;

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    // Fire all webhooks in parallel (don't await — fire and forget)
    for (const webhook of matching) {
      this.callWebhook(webhook, payload).catch((err) =>
        this.logger.error(`Webhook ${webhook.id} failed: ${err.message}`),
      );
    }
  }

  /**
   * Call a single webhook URL with the payload.
   */
  private async callWebhook(
    webhook: Webhook,
    payload: WebhookPayload,
  ): Promise<void> {
    const body = JSON.stringify(payload);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'MeetBot-Webhook/1.0',
    };

    // Add custom headers
    if (webhook.headers && webhook.headers.length > 0) {
      for (const h of webhook.headers) {
        if (h.key && h.value) {
          headers[h.key] = h.value;
        }
      }
    }

    // Add HMAC signature if secret is configured
    if (webhook.secret) {
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(body)
        .digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    // Add webhook ID header
    headers['X-Webhook-Id'] = webhook.id;
    headers['X-Webhook-Event'] = payload.event;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Update last triggered info
      await this.webhookRepository.update(webhook.id, {
        lastTriggeredAt: new Date(),
        lastStatus: response.status,
        lastError: response.ok ? null : `HTTP ${response.status}`,
      });

      this.logger.log(
        `Webhook ${webhook.id} dispatched: ${payload.event} → ${webhook.url} (${response.status})`,
      );
    } catch (error: any) {
      clearTimeout(timeout);
      const errMsg = error?.name === 'AbortError'
        ? 'Request timed out (10s)'
        : (error?.message || 'Unknown network error');

      await this.webhookRepository.update(webhook.id, {
        lastTriggeredAt: new Date(),
        lastStatus: 0,
        lastError: errMsg,
      }).catch(() => {});

      this.logger.error(
        `Webhook ${webhook.id} failed: ${payload.event} → ${webhook.url}: ${errMsg}`,
      );
    }
  }

  /**
   * Send a test webhook to verify the endpoint works.
   */
  async sendTest(
    webhook: Webhook,
  ): Promise<{ success: boolean; status?: number; error?: string }> {
    const payload: WebhookPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook from MeetBot',
        webhookId: webhook.id,
      },
    };

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'MeetBot-Webhook/1.0',
      'X-Webhook-Id': webhook.id,
      'X-Webhook-Event': 'webhook.test',
    };

    if (webhook.headers) {
      for (const h of webhook.headers) {
        if (h.key && h.value) headers[h.key] = h.value;
      }
    }

    if (webhook.secret) {
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(body)
        .digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          success: false,
          status: response.status,
          error: `HTTP ${response.status} ${response.statusText}`,
        };
      }
      return { success: true, status: response.status };
    } catch (error: any) {
      clearTimeout(timeout);
      const errMsg = error?.name === 'AbortError'
        ? 'Request timed out (10s)'
        : (error?.cause?.code === 'ECONNREFUSED'
          ? `Connection refused: ${webhook.url}`
          : error?.cause?.code === 'ENOTFOUND'
            ? `DNS lookup failed: could not resolve host`
            : (error?.message || 'Unknown network error'));
      return { success: false, error: errMsg };
    }
  }
}
