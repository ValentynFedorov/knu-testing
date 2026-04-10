import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTestRunDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsOptional()
  @IsString()
  description?: string;
}
