import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meeting } from '../entities/meeting.entity';
import { TranscriptSegment } from '../entities/transcript-segment.entity';
import { TranscriptsService } from './transcripts.service';
import { TranscriptsController } from './transcripts.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Meeting, TranscriptSegment]),
    AuthModule,
  ],
  providers: [TranscriptsService],
  controllers: [TranscriptsController],
  exports: [TranscriptsService],
})
export class TranscriptsModule {}
