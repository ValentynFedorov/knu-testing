import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { QuestionBankService } from './question-bank.service';
import { CreateQuestionGroupDto } from './dto/create-question-group.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('question-bank')
@UseGuards(JwtAuthGuard)
export class QuestionBankController {
  constructor(private readonly questionBankService: QuestionBankService) {}

  @Post('groups')
  createGroup(@Req() req: any, @Body() dto: CreateQuestionGroupDto) {
    return this.questionBankService.createGroup(req.user.id, dto);
  }

  @Get('groups')
  listGroups(@Req() req: any) {
    return this.questionBankService.listGroups(req.user.id);
  }

  @Post('questions')
  createQuestion(@Req() req: any, @Body() dto: CreateQuestionDto) {
    return this.questionBankService.createQuestion(req.user.id, dto);
  }

  @Get('questions')
  listQuestions(@Req() req: any, @Query('groupId') groupId?: string) {
    return this.questionBankService.listQuestions(req.user.id, groupId);
  }

  @Post('groups/:id/delete')
  deleteGroup(@Req() req: any, @Param('id') id: string) {
    return this.questionBankService.deleteGroup(req.user.id, id);
  }

  @Post('questions/:id/delete')
  deleteQuestion(@Req() req: any, @Param('id') id: string) {
    return this.questionBankService.deleteQuestion(req.user.id, id);
  }
}
