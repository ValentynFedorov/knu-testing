import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum TestQuestionRuleMode {
  GROUP_RANDOM = 'GROUP_RANDOM',
  EXPLICIT_QUESTION = 'EXPLICIT_QUESTION',
}

export class CreateTestRuleDto {
  @IsString()
  @IsIn(['GROUP_RANDOM', 'EXPLICIT_QUESTION'])
  mode: string;

  @IsString()
  @IsOptional()
  groupId?: string;

  @IsString()
  @IsOptional()
  questionId?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  questionsCount?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  orderIndex?: number;
}

export class CreateTestRulesDto {
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateTestRuleDto)
  rules?: CreateTestRuleDto[];
}
