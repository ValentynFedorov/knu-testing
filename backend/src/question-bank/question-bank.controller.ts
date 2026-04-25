import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { QuestionBankService } from './question-bank.service';
import { CreateQuestionGroupDto } from './dto/create-question-group.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { ImportQuestionsDto } from './dto/import-questions.dto';
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

  @Post('questions/import')
  importQuestions(@Req() req: any, @Body() dto: ImportQuestionsDto) {
    return this.questionBankService.importQuestions(req.user.id, dto);
  }

  @Get('claude-prompt')
  getClaudePrompt() {
    return { prompt: this.questionBankService.getClaudePromptTemplate() };
  }

  @Post('questions/import-from-document')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    }),
  )
  async importFromDocument(
    @Req() req: any,
    @UploadedFile() file: any,
    @Body('groupId') groupId: string,
    @Body('questionCount') questionCount: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!groupId) {
      throw new BadRequestException('groupId is required');
    }
    const n = parseInt(questionCount, 10) || 10;
    return this.questionBankService.importFromDocument(req.user.id, groupId, file, n);
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
