import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotAuthService } from './bot-auth.service';

/**
 * Periodically verifies that stored Google sessions (auth.json files) are
 * still accepted by Google. A successful check also writes back Google's
 * rotated cookies, which keeps the session alive; a failed check flags the
 * file as expired so the Settings page can warn the user before a real
 * meeting falls back to guest mode.
 *
 * Interval is controlled by AUTH_HEALTH_CHECK_INTERVAL_HOURS (default 12,
 * 0 disables the scheduled check; manual checks via the API still work).
 */
@Injectable()
export class BotAuthHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotAuthHealthService.name);
  private timer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly botAuthService: BotAuthService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const hours = Number(this.configService.get<string>('AUTH_HEALTH_CHECK_INTERVAL_HOURS', '12'));
    if (!hours || hours <= 0 || Number.isNaN(hours)) {
      this.logger.log('Scheduled Google session check is disabled');
      return;
    }
    const intervalMs = hours * 60 * 60 * 1000;
    // First run shortly after boot, then on the configured interval.
    this.startupTimer = setTimeout(() => this.runCheck(), 60_000);
    this.timer = setInterval(() => this.runCheck(), intervalMs);
    this.logger.log(`Google session check scheduled every ${hours}h`);
  }

  onModuleDestroy() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.timer) clearInterval(this.timer);
  }

  async runCheck(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const results = await this.botAuthService.checkAllSessions();
      const entries = Object.entries(results);
      if (entries.length === 0) {
        this.logger.debug('No Google session files to check');
        return;
      }
      for (const [authPath, status] of entries) {
        const line = `Google session ${authPath}: ${status}`;
        if (status === 'expired') this.logger.warn(line);
        else this.logger.log(line);
      }
    } catch (err: any) {
      this.logger.error(`Google session check failed: ${err.message}`);
    } finally {
      this.running = false;
    }
  }
}
