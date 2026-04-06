import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SettingsController } from './settings.controller';
import { BotAuthService } from './bot-auth.service';

@Module({
  imports: [UsersModule],
  controllers: [SettingsController],
  providers: [BotAuthService],
  exports: [BotAuthService],
})
export class SettingsModule {}
