import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ApiKey } from '../entities/api-key.entity';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeysRepository: Repository<ApiKey>,
  ) {}

  async create(userId: string, name: string): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const rawKey = `mb_${uuidv4().replace(/-/g, '')}`;

    const apiKey = this.apiKeysRepository.create({
      key: rawKey,
      name,
      userId,
      isActive: true,
    });

    const saved = await this.apiKeysRepository.save(apiKey);

    return { apiKey: saved, rawKey };
  }

  async listByUser(userId: string): Promise<ApiKey[]> {
    return this.apiKeysRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async revoke(id: string, userId: string): Promise<void> {
    const apiKey = await this.apiKeysRepository.findOne({
      where: { id, userId },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    apiKey.isActive = false;
    await this.apiKeysRepository.save(apiKey);
  }

  async validateApiKey(key: string): Promise<ApiKey | null> {
    const apiKey = await this.apiKeysRepository.findOne({
      where: { key, isActive: true },
      relations: ['user'],
    });

    if (!apiKey) {
      return null;
    }

    // Update last used timestamp
    apiKey.lastUsedAt = new Date();
    await this.apiKeysRepository.save(apiKey);

    return apiKey;
  }

  async findById(id: string): Promise<ApiKey | null> {
    return this.apiKeysRepository.findOne({ where: { id } });
  }
}
