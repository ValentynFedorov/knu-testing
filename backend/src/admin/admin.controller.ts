import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** Public endpoint — used by NextAuth at login time to check role */
  @Get('is-teacher')
  async isTeacher(@Query('email') email: string) {
    if (!email) return { isTeacher: false };
    const result = await this.adminService.isTeacher(email);
    return { isTeacher: result };
  }

  @Get('teacher-whitelist')
  @UseGuards(JwtAuthGuard)
  async list(@Req() req: any) {
    if (req.user?.role !== 'TEACHER') {
      throw new ForbiddenException('Teachers only');
    }
    return this.adminService.listTeacherWhitelist();
  }

  @Post('teacher-whitelist')
  @UseGuards(JwtAuthGuard)
  async add(@Req() req: any, @Body('email') email: string) {
    if (req.user?.role !== 'TEACHER') {
      throw new ForbiddenException('Teachers only');
    }
    return this.adminService.addTeacherEmail(email);
  }

  @Post('teacher-whitelist/:id/delete')
  @UseGuards(JwtAuthGuard)
  async remove(@Req() req: any, @Param('id') id: string) {
    if (req.user?.role !== 'TEACHER') {
      throw new ForbiddenException('Teachers only');
    }
    return this.adminService.removeTeacherEmail(id);
  }
}
