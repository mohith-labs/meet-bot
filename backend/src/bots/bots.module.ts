import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meeting } from '../entities/meeting.entity';
import { TranscriptSegment } from '../entities/transcript-segment.entity';
import { BotsService } from './bots.service';
import { BotsController } from './bots.controller';
import { GoogleMeetBotService } from './google-meet-bot.service';
import { AuthModule } from '../auth/auth.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Meeting, TranscriptSegment]),
    AuthModule,
    forwardRef(() => WebSocketModule), // forwardRef to avoid circular dependency
    WebhooksModule,
    UsersModule,
  ],
  providers: [BotsService, GoogleMeetBotService],
  controllers: [BotsController],
  exports: [BotsService],
})
export class BotsModule {}
