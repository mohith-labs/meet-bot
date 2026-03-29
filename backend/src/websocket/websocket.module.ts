import { Module, forwardRef } from '@nestjs/common';
import { TranscriptGateway } from './transcript.gateway';
import { AuthModule } from '../auth/auth.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  imports: [
    AuthModule,
    ApiKeysModule,
  ],
  providers: [TranscriptGateway],
  exports: [TranscriptGateway],
})
export class WebSocketModule {}
