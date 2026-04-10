import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LogIntegrityEventDto } from '../attempts/dto/attempts.dto';

@Injectable()
export class IntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async logEvent(dto: LogIntegrityEventDto) {
    const startedAt = new Date(dto.startedAt);
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : null;

    const durationMs =
      startedAt && endedAt ? endedAt.getTime() - startedAt.getTime() : null;

    return this.prisma.integrityEvent.create({
      data: {
        attemptId: dto.attemptId,
        attemptQuestionId: dto.attemptQuestionId ?? null,
        type: dto.type,
        startedAt,
        endedAt,
        durationMs,
        metadata: dto.metadata as any,
      },
    });
  }
}
