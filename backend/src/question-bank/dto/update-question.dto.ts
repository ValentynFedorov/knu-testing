import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionOptionDto } from './create-question.dto';

/**
 * Same shape as CreateQuestionDto but without groupId (group is fixed after
 * creation) and with all fields optional so the client can send partial
 * updates. The service still validates the final state per question type.
 */
export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  @IsIn(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'OPEN_TEXT', 'MATCHING', 'GAP_TEXT'])
  type?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsNumber()
  perQuestionTimeSec?: number | null;

  @IsOptional()
  @IsObject()
  matchingSchema?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  gapSchema?: Record<string, unknown> | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  @IsOptional()
  @IsObject()
  gradingConfig?: Record<string, unknown> | null;
}
