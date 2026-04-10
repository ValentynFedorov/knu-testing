import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QuestionOptionDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsString()
  value: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsBoolean()
  isCorrect: boolean;

  @IsNumber()
  orderIndex: number;
}

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  groupId: string;

  @IsString()
  @IsIn(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'OPEN_TEXT', 'MATCHING', 'GAP_TEXT'])
  type: string;

  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsNumber()
  weight: number;

  @IsOptional()
  @IsNumber()
  perQuestionTimeSec?: number;

  @IsOptional()
  @IsObject()
  matchingSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  gapSchema?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  @IsOptional()
  @IsObject()
  gradingConfig?: Record<string, unknown>;
}
