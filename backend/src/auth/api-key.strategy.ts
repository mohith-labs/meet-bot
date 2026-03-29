import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { ApiKeysService } from '../api-keys/api-keys.service';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private readonly apiKeysService: ApiKeysService) {
    super();
  }

  async validate(req: Request): Promise<any> {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException('API key is missing');
    }

    const result = await this.apiKeysService.validateApiKey(apiKey);
    if (!result) {
      throw new UnauthorizedException('Invalid or inactive API key');
    }

    return { id: result.userId, email: result.user.email, name: result.user.name };
  }
}
