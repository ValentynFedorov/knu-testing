import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateQuestionGroupDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}
