import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionGroupDto } from './dto/create-question-group.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { QuestionType } from '@prisma/client';

@Injectable()
export class QuestionBankService {
  constructor(private readonly prisma: PrismaService) {}

  async createGroup(teacherId: string, dto: CreateQuestionGroupDto) {
    return this.prisma.questionGroup.create({
      data: {
        name: dto.name,
        description: dto.description,
        teacherId,
      },
    });
  }

  async listGroups(teacherId: string) {
    return this.prisma.questionGroup.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createQuestion(teacherId: string, dto: CreateQuestionDto) {
    // Basic validation by type
    if (
      (dto.type === 'SINGLE_CHOICE' || dto.type === 'MULTIPLE_CHOICE') &&
      (!dto.options || dto.options.length === 0)
    ) {
      throw new BadRequestException('Choice questions must have options');
    }
    if (dto.type === 'MATCHING' && !dto.matchingSchema) {
      throw new BadRequestException('Matching questions must have schema');
    }
    if (dto.type === 'GAP_TEXT' && !dto.gapSchema) {
      throw new BadRequestException('Gap text questions must have schema');
    }

    const question = await this.prisma.question.create({
      data: {
        teacherId,
        groupId: dto.groupId,
        type: dto.type as QuestionType,
        text: dto.text,
        imageUrl: dto.imageUrl,
        weight: dto.weight,
        perQuestionTimeSec: dto.perQuestionTimeSec,
        matchingSchema: dto.matchingSchema as any,
        gapSchema: dto.gapSchema as any,
      },
    });

    if (dto.options && dto.options.length > 0) {
      await this.prisma.questionOption.createMany({
        data: dto.options.map((opt) => ({
          questionId: question.id,
          label: opt.label,
          value: opt.value,
          imageUrl: opt.imageUrl,
          isCorrect: opt.isCorrect,
          orderIndex: opt.orderIndex,
        })),
      });
    }

    if (dto.gradingConfig) {
      await this.prisma.questionGradingKey.create({
        data: {
          questionId: question.id,
          rubric: {},
          autoGradingConfig: dto.gradingConfig as any,
        },
      });
    }

    return this.prisma.question.findUnique({
      where: { id: question.id },
      include: {
        options: true,
        gradingKey: true,
      },
    });
  }

  async listQuestions(teacherId: string, groupId?: string) {
    return this.prisma.question.findMany({
      where: {
        teacherId,
        ...(groupId ? { groupId } : {}),
      },
      include: {
        options: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteGroup(teacherId: string, groupId: string) {
    const group = await this.prisma.questionGroup.findUnique({
      where: { id: groupId },
    });
    if (!group || group.teacherId !== teacherId) {
      throw new BadRequestException('Group not found or access denied');
    }
    // Delete questions first (cascade usually handles this but safer to be explicit or rely on schema)
    // Prisma schema doesn't have onDelete: Cascade explicitly set on relations usually, unless configured.
    // Let's rely on Prisma's relation capabilities or manual cleanup.
    // Ideally we should delete questions, which deletes options.
    
    // Check if used in tests
    const usedInRules = await this.prisma.testQuestionRule.count({
      where: { groupId },
    });
    if (usedInRules > 0) {
      throw new BadRequestException('Cannot delete group used in active tests');
    }

    const questions = await this.prisma.question.findMany({ where: { groupId } });
    for (const q of questions) {
      await this.prisma.questionOption.deleteMany({ where: { questionId: q.id } });
      await this.prisma.questionGradingKey.deleteMany({ where: { questionId: q.id } });
      await this.prisma.attemptQuestion.deleteMany({ where: { questionId: q.id } });
    }
    await this.prisma.question.deleteMany({ where: { groupId } });
    
    return this.prisma.questionGroup.delete({
      where: { id: groupId },
    });
  }

  async deleteQuestion(teacherId: string, questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question || question.teacherId !== teacherId) {
      throw new BadRequestException('Question not found or access denied');
    }

    // Check if used in any attempt (integrity/history)
    const usedInAttempts = await this.prisma.attemptQuestion.count({
      where: { questionId },
    });
    if (usedInAttempts > 0) {
      throw new BadRequestException('Cannot delete question that has been answered by students');
    }

    // Check if used in tests rules
    const usedInRules = await this.prisma.testQuestionRule.count({
      where: { questionId },
    });
    if (usedInRules > 0) {
      throw new BadRequestException('Cannot delete question used explicitly in test rules');
    }

    // Delete options and keys
    await this.prisma.questionOption.deleteMany({ where: { questionId } });
    await this.prisma.questionGradingKey.deleteMany({ where: { questionId } });

    return this.prisma.question.delete({
      where: { id: questionId },
    });
  }
}
