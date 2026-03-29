import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'sqlite',
  database: configService.get<string>('DATABASE_URL', './database.sqlite'),
  entities: [__dirname + '/../entities/*.entity{.ts,.js}'],
  synchronize: true, // Set to false in production and use migrations
  logging: false,
});
