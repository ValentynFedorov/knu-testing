import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { TestsService } from './tests.service';
import { CreateTestDto } from './dto/create-test.dto';
import { CreateTestRulesDto } from './dto/create-test-rule.dto';
import { CreateTestRunDto } from './dto/create-test-run.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('tests')
@UseGuards(JwtAuthGuard)
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Post()
  createTest(@Req() req: any, @Body() dto: CreateTestDto) {
    return this.testsService.createTest(req.user.id, dto);
  }

  @Get()
  listTests(@Req() req: any) {
    return this.testsService.listTests(req.user.id);
  }

  @Post(':id/rules')
  addRules(@Param('id') id: string, @Body() dto: CreateTestRulesDto) {
    return this.testsService.addRules(id, dto.rules || []);
  }

  @Post(':id/runs')
  createRun(@Param('id') id: string, @Body() dto: CreateTestRunDto) {
    return this.testsService.createRun(id, dto);
  }

  @Get('runs')
  listRunsForTeacher(@Req() req: any) {
    return this.testsService.listRunsForTeacher(req.user.id);
  }

  @Get(':id/runs')
  listRunsForTest(@Param('id') id: string) {
    return this.testsService.listRunsForTest(id);
  }

  @Post(':id/delete')
  deleteTest(@Req() req: any, @Param('id') id: string) {
    return this.testsService.deleteTest(req.user.id, id);
  }
}
