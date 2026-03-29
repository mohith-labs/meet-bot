import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { User } from '../entities/user.entity';
import { AppSettings } from '../entities/app-settings.entity';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth('JWT-auth')
export class AdminController {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(AppSettings)
    private readonly appSettingsRepository: Repository<AppSettings>,
  ) {}

  @Get('users')
  @ApiOperation({ summary: 'List all users' })
  @ApiResponse({ status: 200, description: 'Returns list of all users' })
  async listUsers() {
    const users = await this.usersRepository.find({
      order: { createdAt: 'DESC' },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update user (toggle isActive, change role)' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUser(
    @Param('id') id: string,
    @Body() body: { isActive?: boolean; role?: string },
  ) {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (body.isActive !== undefined) {
      user.isActive = body.isActive;
    }
    if (
      body.role !== undefined &&
      (body.role === 'admin' || body.role === 'user')
    ) {
      user.role = body.role;
    }

    await this.usersRepository.save(user);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    };
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get app settings' })
  @ApiResponse({ status: 200, description: 'Returns all app settings' })
  async getSettings() {
    const settings = await this.appSettingsRepository.find();
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    return result;
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update app settings' })
  @ApiResponse({ status: 200, description: 'Settings updated successfully' })
  async updateSettings(@Body() body: Record<string, string>) {
    for (const [key, value] of Object.entries(body)) {
      await this.appSettingsRepository.save({ key, value: String(value) });
    }
    const settings = await this.appSettingsRepository.find();
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    return result;
  }
}
