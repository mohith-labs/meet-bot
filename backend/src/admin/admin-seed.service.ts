import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { AppSettings } from '../entities/app-settings.entity';

@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(AppSettings)
    private readonly appSettingsRepository: Repository<AppSettings>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedAdmin();
    await this.seedAppSettings();
  }

  private async seedAdmin(): Promise<void> {
    const email = this.configService.get<string>('ADMIN_EMAIL');
    const password = this.configService.get<string>('ADMIN_PASSWORD');
    const name = this.configService.get<string>('ADMIN_NAME', 'Admin');

    if (!email || !password) {
      this.logger.warn(
        'ADMIN_EMAIL or ADMIN_PASSWORD not set in .env — skipping admin seed',
      );
      return;
    }

    const existingAdmin = await this.usersRepository.findOne({
      where: { email },
    });

    if (existingAdmin) {
      // Update role to admin if it isn't already
      if (existingAdmin.role !== 'admin') {
        existingAdmin.role = 'admin';
        await this.usersRepository.save(existingAdmin);
        this.logger.log(`Updated ${email} to admin role`);
      }
      return;
    }

    // Create new admin user
    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = this.usersRepository.create({
      email,
      password: hashedPassword,
      name,
      role: 'admin',
      isActive: true,
    });

    await this.usersRepository.save(admin);
    this.logger.log(`Admin user created: ${email}`);
  }

  private async seedAppSettings(): Promise<void> {
    const registrationEnabled = this.configService.get<string>(
      'REGISTRATION_ENABLED',
      'true',
    );

    const existing = await this.appSettingsRepository.findOne({
      where: { key: 'registration_enabled' },
    });

    if (!existing) {
      await this.appSettingsRepository.save({
        key: 'registration_enabled',
        value: registrationEnabled,
      });
      this.logger.log(
        `Seeded app setting: registration_enabled = ${registrationEnabled}`,
      );
    }

    // Seed recording retention days (default: 30 days, 0 = keep forever)
    const retentionKey = 'recording_retention_days';
    const existingRetention = await this.appSettingsRepository.findOne({
      where: { key: retentionKey },
    });

    if (!existingRetention) {
      await this.appSettingsRepository.save({
        key: retentionKey,
        value: '30',
      });
      this.logger.log(`Seeded app setting: ${retentionKey} = 30`);
    }
  }
}
