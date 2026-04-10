import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTestDto } from './dto/create-test.dto';
import { CreateTestRuleDto, TestQuestionRuleMode } from './dto/create-test-rule.dto';
import { CreateTestRunDto } from './dto/create-test-run.dto';

@Injectable()
export class TestsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTest(teacherId: string, dto: CreateTestDto) {
    return this.prisma.test.create({
      data: {
        teacherId,
        name: dto.name,
        description: dto.description,
        totalTimeSec: dto.totalTimeSec,
        allowBackNavigation: dto.allowBackNavigation ?? false,
        mode: (dto.mode as any) ?? 'EXAM',
        allowMultipleAttempts: dto.allowMultipleAttempts ?? false,
        showCorrectAnswersImmediately: dto.showCorrectAnswersImmediately ?? false,
        showResultToStudent: dto.showResultToStudent ?? false,
      },
    });
  }

  async listTests(teacherId: string) {
    return this.prisma.test.findMany({
      where: { teacherId, isArchived: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addRules(testId: string, rules: CreateTestRuleDto[]) {
    const existing = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!existing) {
      throw new NotFoundException('Test not found');
    }

    // Handle empty rules array (clear all rules)
    if (!rules || rules.length === 0) {
      await this.prisma.testQuestionRule.deleteMany({ where: { testId } });
      return { count: 0 };
    }

    // Clear existing rules then insert new set
    await this.prisma.testQuestionRule.deleteMany({ where: { testId } });

    return this.prisma.testQuestionRule.createMany({
      data: rules.map((rule, index) => ({
        testId,
        mode: rule.mode,
        groupId: rule.mode === 'GROUP_RANDOM' ? rule.groupId ?? null : null,
        questionId: rule.mode === 'EXPLICIT_QUESTION' ? rule.questionId ?? null : null,
        questionsCount: rule.questionsCount ?? null,
        orderIndex: rule.orderIndex ?? index,
      })),
    });
  }

  async createRun(testId: string, dto: CreateTestRunDto) {
    const test = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!test) {
      throw new NotFoundException('Test not found');
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

    return this.prisma.testRun.create({
      data: {
        testId,
        token: dto.token,
        startsAt,
        endsAt,
      },
    });
  }

  async listRunsForTeacher(teacherId: string) {
    return this.prisma.testRun.findMany({
      where: { test: { teacherId } },
      include: {
        test: true,
        attempts: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listRunsForTest(testId: string) {
    return this.prisma.testRun.findMany({
      where: { testId },
      include: {
        attempts: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteTest(teacherId: string, testId: string) {
    const test = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!test || test.teacherId !== teacherId) {
      throw new NotFoundException('Test not found or access denied');
    }

    const now = new Date();

    // Load runs with attempts information
    const runs = await this.prisma.testRun.findMany({
      where: { testId },
      include: { attempts: true },
    });

    const hasFutureOrActiveRuns = runs.some((r) => r.endsAt > now);
    if (hasFutureOrActiveRuns) {
      throw new BadRequestException('Cannot delete test before all runs are finished');
    }

    const hasAttempts = runs.some((r) => r.attempts.length > 0);

    if (hasAttempts) {
      // Soft-delete / archive test so that it disappears from the tests list
      // but all runs and attempts remain available for analytics.
      return this.prisma.test.update({
        where: { id: testId },
        data: {
          isArchived: true,
        },
      });
    }

    // No attempts and all runs finished (or no runs): hard-delete like before
    await this.prisma.testRun.deleteMany({ where: { testId } });
    await this.prisma.testQuestionRule.deleteMany({ where: { testId } });

    return this.prisma.test.delete({
      where: { id: testId },
    });
  }
}
