import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async registerTeacher(email: string) {
    const normalized = email?.trim().toLowerCase();
    if (!normalized || !normalized.endsWith('@knu.ua')) {
      throw new BadRequestException('Email повинен бути в домені @knu.ua');
    }

    const localPart = normalized.split('@')[0] ?? '';
    const segments = localPart.split('_').filter(Boolean);
    const capitalize = (s: string) =>
      s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    const fullName =
      segments.length >= 2
        ? segments.map(capitalize).join(' ')
        : normalized;

    const user = await this.prisma.user.upsert({
      where: { email: normalized },
      update: { role: 'TEACHER', fullName },
      create: { email: normalized, fullName, role: 'TEACHER' },
      include: { teacher: true },
    });

    if (!user.teacher) {
      await this.prisma.teacher.create({ data: { id: user.id } });
    }

    return { ok: true, email: user.email };
  }

  async checkRole(email: string): Promise<{ role: 'TEACHER' | 'STUDENT' }> {
    const normalized = email?.trim().toLowerCase();
    if (!normalized) {
      return { role: 'STUDENT' };
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { role: true },
    });

    return { role: user?.role ?? 'STUDENT' };
  }
}
