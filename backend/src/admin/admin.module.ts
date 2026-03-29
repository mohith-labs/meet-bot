import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { AppSettings } from '../entities/app-settings.entity';
import { AdminSeedService } from './admin-seed.service';
import { AdminController } from './admin.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AppSettings]),
    AuthModule,
  ],
  controllers: [AdminController],
  providers: [AdminSeedService],
  exports: [AdminSeedService],
})
export class AdminModule {}
