import { Controller, Get, Patch, Param, Body, Req, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // 10.1. Список тестів з історією запусків
  @Get('tests')
  listTestsWithRuns(@Req() req: any) {
    return this.analyticsService.listTestsWithRuns(req.user.id);
  }

  // 10.2. Детальний перегляд конкретного тесту (run)
  @Get('tests/:runId')
  getTestRunDashboard(@Req() req: any, @Param('runId') runId: string) {
    return this.analyticsService.getTestRunDashboard(req.user.id, runId);
  }

  // 10.3. Детальний перегляд результатів конкретного студента
  @Get('tests/:runId/students/:attemptId')
  getStudentAttemptDetail(
    @Req() req: any,
    @Param('runId') runId: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.analyticsService.getStudentAttemptDetail(
      req.user.id,
      runId,
      attemptId,
    );
  }

  // 10.4. Ручне оцінювання відповіді
  @Patch('tests/:runId/students/:attemptId/questions/:attemptQuestionId/score')
  updateQuestionScore(
    @Req() req: any,
    @Param('runId') runId: string,
    @Param('attemptId') attemptId: string,
    @Param('attemptQuestionId') attemptQuestionId: string,
    @Body() body: { score: number },
  ) {
    return this.analyticsService.updateQuestionScore(
      req.user.id,
      runId,
      attemptId,
      attemptQuestionId,
      body.score,
    );
  }
}
