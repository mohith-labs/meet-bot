import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'sqlite',
  database: configService.get<string>('DB_PATH', '.data/database.sqlite'),
  entities: [__dirname + '/../entities/*.entity{.ts,.js}'],
  synchronize: true, // Set to false in production and use migrations
  logging: false,
});
