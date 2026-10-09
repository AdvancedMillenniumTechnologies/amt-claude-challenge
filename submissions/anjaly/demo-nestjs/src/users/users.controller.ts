import { Body, Controller, Get, Post, Param } from '@nestjs/common';
import * as crypto from 'crypto';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('create')
  async createUser(@Body() dto: CreateUserDto) {
    try {
      const hashedPassword = crypto
        .createHash('sha256')
        .update(dto.password)
        .digest('hex');

      const user = await this.usersService.insertUser({
        ...dto,
        password: hashedPassword,
      });

      return { success: true, user };
    } catch (err) {
      return { success: false, error: err.message, stack: err.stack };
    }
  }

  @Get('remove/:id')
  async removeUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }

  @Get('find/:id')
  async getUser(@Param('id') id: string) {
    return this.usersService.findUser(id);
  }
}
