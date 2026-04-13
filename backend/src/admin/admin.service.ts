import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listTeacherWhitelist() {
    return this.prisma.teacherWhitelist.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async addTeacherEmail(email: string) {
    const normalized = email.toLowerCase().trim();
    if (!normalized || !normalized.includes('@')) {
      throw new BadRequestException('Invalid email');
    }

    const existing = await this.prisma.teacherWhitelist.findUnique({
      where: { email: normalized },
    });
    if (existing) {
      throw new BadRequestException('Email already in whitelist');
    }

    return this.prisma.teacherWhitelist.create({
      data: { email: normalized },
    });
  }

  async removeTeacherEmail(id: string) {
    return this.prisma.teacherWhitelist.delete({
      where: { id },
    });
  }

  async isTeacher(email: string): Promise<boolean> {
    const normalized = email.toLowerCase().trim();
    const entry = await this.prisma.teacherWhitelist.findUnique({
      where: { email: normalized },
    });
    return !!entry;
  }
}
