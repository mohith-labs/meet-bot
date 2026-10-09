import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SettingsController } from './settings.controller';
import { BotAuthService } from './bot-auth.service';
import { BotAuthHealthService } from './bot-auth-health.service';

@Module({
  imports: [UsersModule],
  controllers: [SettingsController],
  providers: [BotAuthService, BotAuthHealthService],
  exports: [BotAuthService],
})
export class SettingsModule {}
