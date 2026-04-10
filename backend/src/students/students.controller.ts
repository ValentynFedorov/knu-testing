import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StudentsService } from './students.service';
import { UpsertStudentProfileDto } from './dto/upsert-student-profile.dto';

@Controller('students')
@UseGuards(JwtAuthGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  list(@Req() req: any) {
    const teacherId = req.user.id as string;
    return this.studentsService.listWithAttempts(teacherId);
  }

  @Post()
  upsert(@Req() req: any, @Body() dto: UpsertStudentProfileDto) {
    const teacherId = req.user.id as string;
    return this.studentsService.upsertProfile(teacherId, dto);
  }
}
