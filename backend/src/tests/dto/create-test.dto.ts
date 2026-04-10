import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateTestDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  @IsNumber()
  totalTimeSec?: number;

  @IsBoolean()
  @IsOptional()
  allowBackNavigation?: boolean = false;

  @IsString()
  @IsOptional()
  @IsIn(['TRAINING', 'EXAM'])
  mode?: string = 'EXAM';

  @IsBoolean()
  @IsOptional()
  allowMultipleAttempts?: boolean = false;

  @IsBoolean()
  @IsOptional()
  showCorrectAnswersImmediately?: boolean = false;

  @IsBoolean()
  @IsOptional()
  showResultToStudent?: boolean = false;
}
