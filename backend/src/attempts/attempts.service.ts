import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AttemptStatus, QuestionType, TestMode } from '../entities';
import { PrismaService } from '../prisma/prisma.service';
import { StartAttemptDto, SubmitAnswersDto } from './dto/attempts.dto';

@Injectable()
export class AttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  private now() {
    return new Date();
  }

  async getAttemptResult(studentId: string, attemptId: string) {
    const attempt = await this.prisma.studentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        testRun: {
          include: { test: true },
        },
      },
    });

    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== studentId) throw new ForbiddenException('Forbidden');
    if (!attempt.testRun.test.showResultToStudent) {
      throw new ForbiddenException('Results are not available for this test');
    }
    if (attempt.status === AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Attempt is not finished');
    }

    return {
      attemptId: attempt.id,
      totalScore: attempt.totalScore,
      percentage: attempt.percentage,
      totalTimeSec: attempt.totalTimeSec,
    };
  }

  async startAttempt(studentId: string, dto: StartAttemptDto) {
    const now = this.now();

    const testRun = await this.prisma.testRun.findFirst({
      where: {
        token: dto.token,
        startsAt: { lte: now },
        endsAt: { gte: now },
        test: {
          isArchived: false,
        },
      },
      include: {
        test: {
          include: {
            rules: {
              include: {
                group: {
                  include: { questions: true },
                },
                question: true,
              },
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        attempts: true,
      },
    });

    if (!testRun) {
      throw new NotFoundException('Test run not found or not active');
    }

    const allowMultiple =
      testRun.test.mode === TestMode.TRAINING && testRun.test.allowMultipleAttempts;

    // Resume in-progress attempt if exists
    const inProgressAttempt = await this.prisma.studentAttempt.findFirst({
      where: {
        testRunId: testRun.id,
        userId: studentId,
        status: AttemptStatus.IN_PROGRESS,
      },
      include: {
        questions: {
          include: {
            question: {
              include: { options: true, gradingKey: true },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (inProgressAttempt) {
      return this.sanitizeAttempt(inProgressAttempt, testRun.test);
    }

    // Block multiple finished attempts unless training allows it
    const finishedAttempt = await this.prisma.studentAttempt.findFirst({
      where: {
        testRunId: testRun.id,
        userId: studentId,
        status: {
          in: [
            AttemptStatus.SUBMITTED,
            AttemptStatus.FORCED_SUBMIT,
            AttemptStatus.TIMEOUT,
          ],
        },
      },
    });

    if (finishedAttempt && !allowMultiple) {
      throw new BadRequestException('Attempt already finished');
    }

    // Create new attempt
    const attempt = await this.prisma.studentAttempt.create({
      data: {
        testRunId: testRun.id,
        userId: studentId,
        startedAt: now,
        status: AttemptStatus.IN_PROGRESS,
        capturedName: dto.fullName,
        capturedGroup: dto.group,
      },
    });

    // Variant generation according to rules
    const allSelectedQuestionIds: string[] = [];

    for (const rule of testRun.test.rules) {
      if (rule.mode === 'GROUP_RANDOM') {
        if (!rule.groupId || !rule.questionsCount || !rule.group) continue;
        const available = rule.group.questions.map((q) => q.id);
        const remaining = available.filter((id) => !allSelectedQuestionIds.includes(id));
        const count = Math.min(rule.questionsCount, remaining.length);
        const picked = this.pickRandom(remaining, count);
        allSelectedQuestionIds.push(...picked);
      } else if (rule.mode === 'EXPLICIT_QUESTION') {
        if (rule.questionId) {
          if (!allSelectedQuestionIds.includes(rule.questionId)) {
            allSelectedQuestionIds.push(rule.questionId);
          }
        }
      }
    }

    if (allSelectedQuestionIds.length === 0) {
      // Clean up the empty attempt
      await this.prisma.studentAttempt.delete({ where: { id: attempt.id } });
      throw new BadRequestException('Test has no questions configured. Contact your teacher.');
    }

    // Shuffle final list
    const shuffledQuestionIds = this.shuffle([...allSelectedQuestionIds]);

    const questions = await this.prisma.question.findMany({
      where: { id: { in: shuffledQuestionIds } },
      include: { options: true },
    });

    // Map to keep original order from shuffled ids
    const questionOrder: Record<string, number> = {};
    shuffledQuestionIds.forEach((id, idx) => {
      questionOrder[id] = idx;
    });

    await this.prisma.attemptQuestion.createMany({
      data: questions.map((q) => ({
        attemptId: attempt.id,
        questionId: q.id,
        orderIndex: questionOrder[q.id],
        perQuestionTimeSec: q.perQuestionTimeSec ?? null,
        maxScore: q.weight,
      })),
    });

    const fullAttempt = await this.prisma.studentAttempt.findUnique({
      where: { id: attempt.id },
      include: {
        questions: {
          include: {
            question: {
              include: { options: true, gradingKey: true },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    return this.sanitizeAttempt(fullAttempt!, testRun.test);
  }

  async getAttempt(studentId: string, attemptId: string) {
    const attempt = await this.prisma.studentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        testRun: {
          include: { test: true },
        },
        questions: {
          include: {
            question: {
              include: { options: true, gradingKey: true },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== studentId) throw new ForbiddenException('Forbidden');

    return this.sanitizeAttempt(attempt, attempt.testRun.test);
  }

  private sanitizeAttempt(attempt: any, test: any) {
    const includeCorrectAnswers =
      test?.mode === TestMode.TRAINING && test?.showCorrectAnswersImmediately;

    function sanitizeGapSchema(schema: any) {
      if (!schema) return null;
      if (includeCorrectAnswers) return schema;
      // Strip correctAnswers for student view
      const gaps = Array.isArray(schema.gaps) ? schema.gaps : [];
      return {
        ...schema,
        gaps: gaps.map((g: any) => ({
          ...g,
          correctAnswers: undefined,
        })),
      };
    }

    function sanitizeGradingConfig(config: any) {
      if (!config) return null;
      if (includeCorrectAnswers) return config;
      const { expectedAnswers, ...rest } = config as any;
      return rest;
    }

    return {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      totalTimeSec: test?.totalTimeSec ?? null,
      testMode: test?.mode ?? TestMode.EXAM,
      allowBackNavigation: test?.allowBackNavigation ?? false,
      showCorrectAnswersImmediately: test?.showCorrectAnswersImmediately ?? false,
      showResultToStudent: test?.showResultToStudent ?? false,
      questions: attempt.questions.map((aq) => ({
        id: aq.id,
        orderIndex: aq.orderIndex,
        perQuestionTimeSec: aq.perQuestionTimeSec,
        isTimedOut: aq.isTimedOut,
        question: {
          id: aq.question.id,
          type: aq.question.type,
          text: aq.question.text,
          imageUrl: aq.question.imageUrl,
          weight: aq.question.weight,
          matchingSchema: aq.question.matchingSchema,
          gapSchema: sanitizeGapSchema(aq.question.gapSchema),
          gradingConfig: sanitizeGradingConfig(aq.question.gradingKey?.autoGradingConfig),
          options: aq.question.options.map((opt) => ({
            id: opt.id,
            label: opt.label,
            value: opt.value,
            imageUrl: opt.imageUrl,
            orderIndex: opt.orderIndex,
            ...(includeCorrectAnswers ? { isCorrect: opt.isCorrect } : {}),
          })),
        },
      })),
    };
  }

  private pickRandom<T>(items: T[], count: number): T[] {
    const arr = [...items];
    const result: T[] = [];
    for (let i = 0; i < count && arr.length > 0; i++) {
      const idx = Math.floor(Math.random() * arr.length);
      result.push(arr[idx]);
      arr.splice(idx, 1);
    }
    return result;
  }

  private shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  async submitAnswers(studentId: string, attemptId: string, dto: SubmitAnswersDto) {
    const attempt = await this.prisma.studentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        testRun: {
          include: { test: true },
        },
      },
    });

    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== studentId) throw new ForbiddenException('Forbidden');
    if (attempt.status !== AttemptStatus.IN_PROGRESS)
      throw new BadRequestException('Attempt is not in progress');

    const now = this.now();

    // Check global timer (totalTimeSec) if set
    if (attempt.testRun.test.totalTimeSec && attempt.startedAt) {
      const elapsedSec =
        (now.getTime() - new Date(attempt.startedAt).getTime()) / 1000;
      if (elapsedSec > attempt.testRun.test.totalTimeSec) {
        await this.forceTimeout(attemptId, now);
        throw new BadRequestException('Test time is over');
      }
    }

    // Ensure all referenced AttemptQuestions belong to this attempt
    const aqIds = dto.answers.map((a) => a.attemptQuestionId);
    const attemptQuestions = await this.prisma.attemptQuestion.findMany({
      where: { id: { in: aqIds }, attemptId },
      include: { question: true },
    });
    const aqMap = new Map(attemptQuestions.map((aq) => [aq.id, aq]));

    for (const ans of dto.answers) {
      const aq = aqMap.get(ans.attemptQuestionId);
      if (!aq) continue;
      if (aq.isTimedOut) continue;

      // For per-question timer, we could enforce timeouts using perQuestionTimeSec and timestamps here.

      await this.prisma.answer.create({
        data: {
          attemptQuestionId: aq.id,
          answerPayload: ans.answerPayload as any,
        },
      });
    }

    return { ok: true };
  }

  async finishAttempt(studentId: string, attemptId: string, timePerQuestion?: Record<string, number>) {
    const attempt = await this.prisma.studentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        testRun: {
          include: { test: true },
        },
        questions: {
          include: {
            question: {
              include: { options: true, gradingKey: true },
            },
            answers: true,
          },
        },
      },
    });

    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== studentId) throw new ForbiddenException('Forbidden');
    if (attempt.status !== AttemptStatus.IN_PROGRESS)
      throw new BadRequestException('Attempt is not in progress');

    const now = this.now();

    // Enforce global timer again
    let status: AttemptStatus = AttemptStatus.SUBMITTED;
    if (attempt.testRun.test.totalTimeSec && attempt.startedAt) {
      const elapsedSec =
        (now.getTime() - new Date(attempt.startedAt).getTime()) / 1000;
      if (elapsedSec > attempt.testRun.test.totalTimeSec) {
        status = AttemptStatus.TIMEOUT;
      }
    }

    // Auto scoring for objective questions (choice + matching + gap + open text)
    let totalScore = 0;
    let maxTotal = 0;
    const perQuestionScores: { id: string; score: number }[] = [];
    const matchText = (
      value: string,
      expected: string,
      mode: string,
      caseInsensitive: boolean,
    ) => {
      const v = caseInsensitive ? value.toLowerCase() : value;
      const e = caseInsensitive ? expected.toLowerCase() : expected;
      switch (mode) {
        case 'CONTAINS':
          return v.includes(e);
        case 'REGEX':
          try {
            const re = new RegExp(expected, caseInsensitive ? 'i' : undefined);
            return re.test(value);
          } catch {
            return false;
          }
        case 'EXACT':
        default:
          return v === e;
      }
    };

    for (const aq of attempt.questions) {
      maxTotal += Number(aq.maxScore);

      const latestAnswer = aq.answers.sort((a, b) =>
        new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
      )[aq.answers.length - 1];

      if (!latestAnswer) {
        perQuestionScores.push({ id: aq.id, score: 0 });
        continue;
      }

      const payload = latestAnswer.answerPayload as any;
      let questionScore = 0;

      if (
        aq.question.type === QuestionType.SINGLE_CHOICE &&
        Array.isArray(payload.selectedOptionIds) &&
        payload.selectedOptionIds.length === 1
      ) {
        const selected = payload.selectedOptionIds[0];
        const correct = aq.question.options.find((o) => o.isCorrect)?.id;
        if (selected === correct) {
          questionScore = Number(aq.maxScore);
        }
      } else if (
        aq.question.type === QuestionType.MULTIPLE_CHOICE &&
        Array.isArray(payload.selectedOptionIds)
      ) {
        const selectedSet = new Set(payload.selectedOptionIds as string[]);
        const correctOptions = aq.question.options.filter((o) => o.isCorrect);
        const correctIds = correctOptions.map((o) => o.id);
        if (
          correctIds.length === selectedSet.size &&
          correctIds.every((id) => selectedSet.has(id))
        ) {
          questionScore = Number(aq.maxScore);
        }
      } else if (aq.question.type === QuestionType.MATCHING) {
        const schema = (aq.question as any).matchingSchema as
          | Record<string, string>
          | null
          | undefined;
        const pairs = Array.isArray(payload?.pairs)
          ? (payload.pairs as { left: string; right: string | null }[])
          : [];

        if (schema && Object.keys(schema).length > 0 && pairs.length > 0) {
          const givenMap = new Map<string, string | null>();
          for (const p of pairs) {
            givenMap.set(p.left, p.right ?? null);
          }

          const entries = Object.entries(schema);
          const totalPairs = entries.length;
          let correctCount = 0;

          for (const [left, right] of entries) {
            const given = givenMap.get(left) ?? null;
            if (given === right) {
              correctCount++;
            }
          }

          if (totalPairs > 0 && correctCount > 0) {
            const fraction = correctCount / totalPairs;
            questionScore = Number(aq.maxScore) * fraction;
          }
        }
      } else if (aq.question.type === QuestionType.OPEN_TEXT) {
        const config = aq.question.gradingKey?.autoGradingConfig as any;
        const expectedAnswers = Array.isArray(config?.expectedAnswers)
          ? (config.expectedAnswers as string[])
          : [];
        const mode = (config?.matchingMode as string) || 'EXACT';
        const caseInsensitive =
          config?.matchingMode === 'CASE_INSENSITIVE' || config?.caseInsensitive === true;

        const studentText = String(payload?.text ?? '').trim();
        if (studentText && expectedAnswers.length > 0) {
          const matched = expectedAnswers.some((exp) =>
            matchText(studentText, String(exp).trim(), mode, caseInsensitive),
          );
          if (matched) {
            questionScore = Number(aq.maxScore);
          }
        }
      } else if (aq.question.type === QuestionType.GAP_TEXT) {
        const schema = (aq.question as any).gapSchema as
          | { gaps?: { id: string; correctAnswers?: string[]; matchingMode?: string }[] }
          | undefined;
        const gaps = Array.isArray(schema?.gaps) ? schema!.gaps! : [];
        const answers = Array.isArray(payload?.gaps)
          ? (payload.gaps as { id: string; value: string }[])
          : [];

        if (gaps.length > 0 && answers.length > 0) {
          const answerMap = new Map<string, string>();
          for (const a of answers) {
            answerMap.set(a.id, String(a.value ?? '').trim());
          }

          let correctCount = 0;
          for (const gap of gaps) {
            const given = (answerMap.get(gap.id) ?? '').trim();
            const expectedList = Array.isArray(gap.correctAnswers)
              ? gap.correctAnswers.map((v) => String(v).trim())
              : [];
            const mode = (gap.matchingMode as string) || 'EXACT';
            const caseInsensitive = mode === 'CASE_INSENSITIVE';

            if (
              expectedList.length > 0 &&
              expectedList.some((exp) => matchText(given, exp, mode, caseInsensitive))
            ) {
              correctCount++;
            }
          }

          if (correctCount > 0) {
            questionScore = Number(aq.maxScore) * (correctCount / gaps.length);
          }
        }
      }

      // OPEN_TEXT without config remains manual; GAP_TEXT scored above

      totalScore += questionScore;
      perQuestionScores.push({ id: aq.id, score: questionScore });
    }

    const percentage = maxTotal > 0 ? (totalScore / maxTotal) * 100 : 0;

    // Persist per-question scores and time for analytics UI
    for (const { id, score } of perQuestionScores) {
      await this.prisma.attemptQuestion.update({
        where: { id },
        data: {
          scoreAwarded: score,
          ...(timePerQuestion?.[id] != null
            ? { timeSpentSec: Math.round(timePerQuestion[id]) }
            : {}),
        },
      });
    }
    const totalTimeSec = attempt.startedAt
      ? Math.round((now.getTime() - new Date(attempt.startedAt).getTime()) / 1000)
      : null;

    const updated = await this.prisma.studentAttempt.update({
      where: { id: attempt.id },
      data: {
        finishedAt: now,
        status,
        totalScore,
        percentage,
        totalTimeSec,
      },
    });

    return updated;
  }

  private async forceTimeout(attemptId: string, when: Date) {
    await this.prisma.studentAttempt.update({
      where: { id: attemptId },
      data: {
        status: AttemptStatus.TIMEOUT,
        finishedAt: when,
      },
    });
  }
}
