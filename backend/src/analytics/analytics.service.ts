import { Injectable } from '@nestjs/common';
import { AttemptStatus, IntegrityEventType } from '../entities';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 10.1. Список тестів з історією запусків
   */
  async listTestsWithRuns(teacherId: string) {
    const runs = await this.prisma.testRun.findMany({
      where: { test: { teacherId } },
      include: {
        test: true,
        attempts: {
          include: {
            integrityEvents: true,
          },
        },
      },
      orderBy: { startsAt: 'desc' },
    });

    return runs.map((run) => {
      const startedCount = run.attempts.length;
      const finishedAttempts = run.attempts.filter((a) =>
        [
          AttemptStatus.SUBMITTED,
          AttemptStatus.FORCED_SUBMIT,
          AttemptStatus.TIMEOUT,
        ].includes(a.status as AttemptStatus),
      );
      const finishedCount = finishedAttempts.length;

      const avgScore =
        finishedCount > 0
          ?
              finishedAttempts.reduce(
                (sum, a) => sum + Number(a.totalScore ?? 0),
                0,
              ) / finishedCount
          : 0;
      const avgPercentage =
        finishedCount > 0
          ?
              finishedAttempts.reduce(
                (sum, a) => sum + Number(a.percentage ?? 0),
                0,
              ) / finishedCount
          : 0;

      const totalViolations = run.attempts.reduce(
        (sum, a) => sum + a.integrityEvents.length,
        0,
      );

      return {
        testId: run.testId,
        testName: run.test.name,
        testDescription: run.test.description,
        runId: run.id,
        token: run.token,
        status: run.status,
        startsAt: run.startsAt,
        endsAt: run.endsAt,
        studentsStarted: startedCount,
        studentsFinished: finishedCount,
        averageScore: avgScore,
        averagePercentage: avgPercentage,
        totalViolations,
      };
    });
  }

  /**
   * 10.2. Детальний перегляд конкретного тесту (run)
   */
  async getTestRunDashboard(teacherId: string, runId: string) {
    const run = await this.prisma.testRun.findUnique({
      where: { id: runId },
      include: {
        test: true,
        attempts: {
          include: {
            user: true,
            integrityEvents: true,
          },
        },
      },
    });

    if (!run || run.test.teacherId !== teacherId) {
      throw new Error('Test run not found');
    }

    const attempts = run.attempts;
    const totalStudents = attempts.length;

    const scores = attempts
      .filter((a) => a.totalScore !== null && a.totalScore !== undefined)
      .map((a) => Number(a.totalScore));
    const percentages = attempts
      .filter((a) => a.percentage !== null && a.percentage !== undefined)
      .map((a) => Number(a.percentage));

    const totalViolations = attempts.reduce(
      (sum, a) => sum + a.integrityEvents.length,
      0,
    );

    const suspiciousStudents = attempts.filter((a) => a.integrityEvents.length > 0)
      .length;

    const averageScore = scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;
    const minScore = scores.length ? Math.min(...scores) : 0;
    const maxScore = scores.length ? Math.max(...scores) : 0;

    const averageTimeSec = attempts.length
      ?
          attempts.reduce(
            (sum, a) => sum + (a.totalTimeSec ?? 0),
            0,
          ) / attempts.length
      : 0;

    const histogramBuckets = this.buildHistogram(scores);

    const studentsTable = attempts.map((a) => {
      const fullscreenEvents = a.integrityEvents.filter(
        (e) => e.type === IntegrityEventType.FULLSCREEN_EXIT,
      );
      const tabSwitchEvents = a.integrityEvents.filter(
        (e) => e.type === IntegrityEventType.TAB_BLUR,
      );
      const pasteEvents = a.integrityEvents.filter(
        (e) => e.type === IntegrityEventType.PASTE,
      );
      const screenshotEvents = a.integrityEvents.filter(
        (e) => e.type === IntegrityEventType.SCREENSHOT,
      );

      return {
        attemptId: a.id,
        fullName: a.user.fullName,
        email: a.user.email,
        totalScore: a.totalScore,
        percentage: a.percentage,
        totalTimeSec: a.totalTimeSec,
        violationsCount: a.integrityEvents.length,
        indicators: {
          fullscreenExit: fullscreenEvents.length > 0,
          tabSwitch: tabSwitchEvents.length > 0,
          pasteDetection: pasteEvents.length > 0,
          screenshot: screenshotEvents.length > 0,
        },
      };
    });

    return {
      run: {
        id: run.id,
        token: run.token,
        status: run.status,
        startsAt: run.startsAt,
        endsAt: run.endsAt,
        test: {
          id: run.test.id,
          name: run.test.name,
          description: run.test.description,
        },
      },
      summary: {
        totalStudents,
        histogram: histogramBuckets,
        averageScore,
        minScore,
        maxScore,
        averageTimeSec,
        totalViolations,
        suspiciousStudents,
      },
      students: studentsTable,
    };
  }

  /**
   * 10.3. Детальний перегляд результатів конкретного студента
   */
  async getStudentAttemptDetail(teacherId: string, runId: string, attemptId: string) {
    const attempt = await this.prisma.studentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        user: true,
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
          orderBy: { orderIndex: 'asc' },
        },
        integrityEvents: true,
      },
    });

    if (!attempt || attempt.testRunId !== runId) {
      throw new Error('Attempt not found for this test run');
    }
    if (attempt.testRun.test.teacherId !== teacherId) {
      throw new Error('Forbidden');
    }

    const questions = attempt.questions.map((aq) => {
      const latestAnswer = aq.answers.sort((a, b) =>
        new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
      )[aq.answers.length - 1];

      return {
        attemptQuestionId: aq.id,
        orderIndex: aq.orderIndex,
        questionId: aq.questionId,
        text: aq.question.text,
        imageUrl: aq.question.imageUrl,
        type: aq.question.type,
        weight: aq.question.weight,
        options: aq.question.options,
        gradingConfig: aq.question.gradingKey?.autoGradingConfig ?? null,
        maxScore: aq.maxScore,
        scoreAwarded: aq.scoreAwarded,
        perQuestionTimeSec: aq.perQuestionTimeSec,
        startedAt: aq.startedAt,
        answeredAt: aq.answeredAt,
        timeSpentSec: aq.timeSpentSec,
        isTimedOut: aq.isTimedOut,
        answer: latestAnswer ? latestAnswer.answerPayload : null,
      };
    });

    const violationsLog = attempt.integrityEvents
      .slice()
      .sort(
        (a, b) =>
          new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
      )
      .map((e) => ({
        id: e.id,
        type: e.type,
        attemptQuestionId: e.attemptQuestionId,
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        durationMs: e.durationMs,
      }));

    return {
      student: {
        id: attempt.userId,
        fullName: attempt.capturedName || attempt.user.fullName,
        email: attempt.user.email,
        group: attempt.capturedGroup,
      },
      test: {
        id: attempt.testRun.test.id,
        name: attempt.testRun.test.name,
        token: attempt.testRun.token,
        runId: attempt.testRunId,
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
      },
      result: {
        totalScore: attempt.totalScore,
        percentage: attempt.percentage,
      },
      questions,
      violations: violationsLog,
    };
  }

  /**
   * 10.4. Ручне оцінювання відповіді викладачем
   */
  async updateQuestionScore(
    teacherId: string,
    runId: string,
    attemptId: string,
    attemptQuestionId: string,
    score: number,
  ) {
    // Verify ownership
    const aq = await this.prisma.attemptQuestion.findUnique({
      where: { id: attemptQuestionId },
      include: {
        attempt: {
          include: {
            testRun: { include: { test: true } },
          },
        },
      },
    });

    if (!aq || aq.attemptId !== attemptId || aq.attempt.testRunId !== runId) {
      throw new Error('Question not found');
    }
    if (aq.attempt.testRun.test.teacherId !== teacherId) {
      throw new Error('Forbidden');
    }

    const maxScore = Number(aq.maxScore);
    const clampedScore = Math.max(0, Math.min(score, maxScore));

    // Update the question score
    await this.prisma.attemptQuestion.update({
      where: { id: attemptQuestionId },
      data: { scoreAwarded: clampedScore },
    });

    // Recalculate attempt totals
    const allQuestions = await this.prisma.attemptQuestion.findMany({
      where: { attemptId },
      select: { scoreAwarded: true, maxScore: true },
    });

    const totalScore = allQuestions.reduce(
      (sum, q) => sum + Number(q.scoreAwarded ?? 0),
      0,
    );
    const maxTotal = allQuestions.reduce(
      (sum, q) => sum + Number(q.maxScore),
      0,
    );
    const percentage = maxTotal > 0 ? (totalScore / maxTotal) * 100 : 0;

    await this.prisma.studentAttempt.update({
      where: { id: attemptId },
      data: { totalScore, percentage },
    });

    return {
      scoreAwarded: clampedScore,
      totalScore,
      percentage,
    };
  }

  private buildHistogram(scores: number[]) {
    // Simple 10-bucket histogram: 0-10,10-20,...,90-100
    const buckets = new Array(10).fill(0);
    for (const s of scores) {
      const pct = s; // assume scores already in same scale; frontend may convert
      const idx = Math.max(0, Math.min(9, Math.floor(pct / 10)));
      buckets[idx]++;
    }
    return buckets.map((count, index) => ({
      rangeStart: index * 10,
      rangeEnd: index * 10 + 10,
      count,
    }));
  }
}
