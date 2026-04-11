import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AttemptsService } from './attempts.service';
import { FinishAttemptDto, StartAttemptDto, SubmitAnswersDto } from './dto/attempts.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('attempts')
@UseGuards(JwtAuthGuard)
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  @Post('start')
  start(@Req() req: any, @Body() dto: StartAttemptDto) {
    return this.attemptsService.startAttempt(req.user.id, dto);
  }

  @Get(':id')
  getAttempt(@Req() req: any, @Param('id') id: string) {
    return this.attemptsService.getAttempt(req.user.id, id);
  }

  @Get(':id/result')
  getResult(@Req() req: any, @Param('id') id: string) {
    return this.attemptsService.getAttemptResult(req.user.id, id);
  }

  @Post(':id/answers')
  submitAnswers(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SubmitAnswersDto,
  ) {
    return this.attemptsService.submitAnswers(req.user.id, id, dto);
  }

  @Post(':id/finish')
  finish(@Req() req: any, @Param('id') id: string, @Body() dto: FinishAttemptDto) {
    return this.attemptsService.finishAttempt(req.user.id, id, dto.timePerQuestion);
  }
}
