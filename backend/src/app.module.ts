import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { BotsModule } from './bots/bots.module';
import { MeetingsModule } from './meetings/meetings.module';
import { TranscriptsModule } from './transcripts/transcripts.module';
import { WebSocketModule } from './websocket/websocket.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SettingsModule } from './settings/settings.module';
import { databaseConfig } from './config/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: databaseConfig,
    }),
    AuthModule,
    UsersModule,
    ApiKeysModule,
    BotsModule,
    MeetingsModule,
    TranscriptsModule,
    WebSocketModule,
    WebhooksModule,
    SettingsModule,
  ],
})
export class AppModule {}
