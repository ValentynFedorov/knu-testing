import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role?: 'TEACHER' | 'STUDENT';
  name?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    const email = payload.email?.toLowerCase();
    if (!email) {
      throw new Error('JWT payload missing email');
    }

    const role = payload.role === 'TEACHER' ? 'TEACHER' : 'STUDENT';

    // Prefer name from token (set by NextAuth), fallback to email
    const rawName = (payload as any).name;
    const fullName =
      typeof rawName === 'string' && rawName.trim().length > 0
        ? rawName.trim()
        : email;

    const user = await this.prisma.user.upsert({
      where: { email },
      update: { role, fullName },
      create: {
        email,
        fullName,
        role,
      },
      include: {
        teacher: true,
      },
    });

    if (role === 'TEACHER' && !user.teacher) {
      await this.prisma.teacher.create({
        data: {
          id: user.id,
        },
      });
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
