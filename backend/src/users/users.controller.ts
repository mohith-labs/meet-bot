import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user details' })
  @ApiResponse({ status: 200, description: 'Returns current user details' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@CurrentUser() user: any) {
    const fullUser = await this.usersService.findByIdOrFail(user.id);
    return {
      id: fullUser.id,
      email: fullUser.email,
      name: fullUser.name,
      createdAt: fullUser.createdAt,
      updatedAt: fullUser.updatedAt,
    };
  }
}
