import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertStudentProfileDto } from './dto/upsert-student-profile.dto';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertProfile(teacherId: string, dto: UpsertStudentProfileDto) {
    const email = dto.email.toLowerCase();

    const profile = await this.prisma.studentProfile.upsert({
      where: {
        teacherId_email: {
          teacherId,
          email,
        },
      },
      update: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        middleName: dto.middleName,
        group: dto.group,
        courseId: dto.courseId ?? null,
      },
      create: {
        teacherId,
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        middleName: dto.middleName,
        group: dto.group,
        courseId: dto.courseId,
      },
    });

    return profile;
  }

  // ── Course CRUD ──

  async listCourses(teacherId: string) {
    return this.prisma.course.findMany({
      where: { teacherId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { studentProfiles: true } } },
    });
  }

  async createCourse(teacherId: string, name: string) {
    return this.prisma.course.create({
      data: { teacherId, name },
    });
  }

  async renameCourse(teacherId: string, courseId: string, name: string) {
    return this.prisma.course.update({
      where: { id: courseId, teacherId },
      data: { name },
    });
  }

  async deleteCourse(teacherId: string, courseId: string) {
    // Unassign students first, then delete
    await this.prisma.studentProfile.updateMany({
      where: { teacherId, courseId },
      data: { courseId: null },
    });
    return this.prisma.course.delete({
      where: { id: courseId, teacherId },
    });
  }

  async listWithAttempts(teacherId: string) {
    const [profiles, attempts] = await this.prisma.$transaction([
      this.prisma.studentProfile.findMany({ where: { teacherId }, include: { course: true } }),
      this.prisma.studentAttempt.findMany({
        where: {
          testRun: {
            test: { teacherId },
          },
        },
        include: {
          user: true,
          testRun: {
            include: { test: true },
          },
        },
      }),
    ]);

    const profileByEmail = new Map<string, (typeof profiles)[number]>();
    for (const p of profiles) {
      profileByEmail.set(p.email.toLowerCase(), p);
    }

    type AttemptInfo = (typeof attempts)[number];
    const attemptsByEmail = new Map<string, AttemptInfo[]>();

    for (const a of attempts) {
      const email = a.user.email.toLowerCase();
      if (!attemptsByEmail.has(email)) {
        attemptsByEmail.set(email, []);
      }
      attemptsByEmail.get(email)!.push(a);
    }

    const allEmails = new Set<string>([
      ...Array.from(profileByEmail.keys()),
      ...Array.from(attemptsByEmail.keys()),
    ]);

    const result = Array.from(allEmails).map((email) => {
      const profile = profileByEmail.get(email);
      const userAttempts = attemptsByEmail.get(email) || [];

      const attemptsView = userAttempts
        .slice()
        .sort((a, b) => {
          const aTime = a.finishedAt ?? a.startedAt ?? a.testRun.startsAt;
          const bTime = b.finishedAt ?? b.startedAt ?? b.testRun.startsAt;
          return aTime.getTime() - bTime.getTime();
        })
        .map((a) => ({
          attemptId: a.id,
          testName: a.testRun.test.name,
          runId: a.testRunId,
          token: a.testRun.token,
          startedAt: a.startedAt ?? a.testRun.startsAt,
          finishedAt: a.finishedAt ?? null,
          totalScore: a.totalScore,
          percentage: a.percentage,
        }));

      return {
        email,
        profile: profile
          ? {
              id: profile.id,
              firstName: profile.firstName,
              lastName: profile.lastName,
              middleName: profile.middleName,
              group: profile.group,
              courseId: profile.courseId,
              courseName: (profile as any).course?.name ?? null,
            }
          : null,
        attempts: attemptsView,
      };
    });

    // Sort by lastName/firstName if profile exists, otherwise by email
    result.sort((a, b) => {
      if (a.profile && b.profile) {
        const lastCmp = a.profile.lastName.localeCompare(b.profile.lastName);
        if (lastCmp !== 0) return lastCmp;
        return a.profile.firstName.localeCompare(b.profile.firstName);
      }
      if (a.profile && !b.profile) return -1;
      if (!a.profile && b.profile) return 1;
      return a.email.localeCompare(b.email);
    });

    return result;
  }
}
