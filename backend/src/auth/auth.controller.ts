import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-teacher')
  async registerTeacher(@Body() body: { email: string }) {
    return this.authService.registerTeacher(body.email);
  }

  @Get('check-role')
  async checkRole(@Query('email') email: string) {
    return this.authService.checkRole(email);
  }
}
