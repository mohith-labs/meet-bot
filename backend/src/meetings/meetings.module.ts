import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meeting } from '../entities/meeting.entity';
import { MeetingsService } from './meetings.service';
import { MeetingsController } from './meetings.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Meeting]), AuthModule],
  providers: [MeetingsService],
  controllers: [MeetingsController],
  exports: [MeetingsService],
})
export class MeetingsModule {}
