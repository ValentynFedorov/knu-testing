import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
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

  // ── Courses ──

  @Get('courses')
  listCourses(@Req() req: any) {
    const teacherId = req.user.id as string;
    return this.studentsService.listCourses(teacherId);
  }

  @Post('courses')
  createCourse(@Req() req: any, @Body('name') name: string) {
    const teacherId = req.user.id as string;
    return this.studentsService.createCourse(teacherId, name);
  }

  @Patch('courses/:id')
  renameCourse(@Req() req: any, @Param('id') id: string, @Body('name') name: string) {
    const teacherId = req.user.id as string;
    return this.studentsService.renameCourse(teacherId, id, name);
  }

  @Delete('courses/:id')
  deleteCourse(@Req() req: any, @Param('id') id: string) {
    const teacherId = req.user.id as string;
    return this.studentsService.deleteCourse(teacherId, id);
  }
}
