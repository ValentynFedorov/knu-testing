import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { IntegrityEventType } from '../../entities';

export class StartAttemptDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  group?: string;
}

export class AnswerDto {
  // AttemptQuestion IDs are cuid strings in the database schema, not strict UUIDs,
  // тому тут перевіряємо лише, що це непорожній рядок.
  @IsString()
  @IsNotEmpty()
  attemptQuestionId: string;

  @IsObject()
  answerPayload: Record<string, unknown>;
}

export class SubmitAnswersDto {
  @IsArray()
  answers: AnswerDto[];
}

export class FinishAttemptDto {
  @IsOptional()
  @IsObject()
  timePerQuestion?: Record<string, number>;
}

export class LogIntegrityEventDto {
  @IsString()
  @IsNotEmpty()
  attemptId: string;

  @IsString()
  @IsOptional()
  attemptQuestionId?: string;

  @IsEnum(IntegrityEventType)
  type: IntegrityEventType;

  @IsString()
  @IsNotEmpty()
  startedAt: string; // ISO string from client

  @IsString()
  @IsOptional()
  endedAt?: string; // ISO string from client

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
