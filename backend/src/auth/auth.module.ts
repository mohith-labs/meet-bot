import { Module, forwardRef } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { ApiKeyStrategy } from './api-key.strategy';
import { UsersModule } from '../users/users.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AppSettings } from '../entities/app-settings.entity';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>(
          'JWT_SECRET',
          'your-super-secret-key-change-in-production',
        ),
        signOptions: { expiresIn: '7d' },
      }),
    }),
    TypeOrmModule.forFeature([AppSettings]),
    UsersModule,
    forwardRef(() => ApiKeysModule),
  ],
  providers: [AuthService, JwtStrategy, ApiKeyStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
