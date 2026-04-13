import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CodeRunnerService } from './code-runner.service';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

class ExecuteCodeDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  language: string;

  @IsOptional()
  @IsString()
  stdin?: string;
}

@Controller('code')
@UseGuards(JwtAuthGuard)
export class CodeRunnerController {
  constructor(private readonly codeRunnerService: CodeRunnerService) {}

  @Post('execute')
  execute(@Body() dto: ExecuteCodeDto) {
    return this.codeRunnerService.execute(dto.code, dto.language, dto.stdin);
  }

  @Get('languages')
  languages() {
    return this.codeRunnerService.getSupportedLanguages();
  }
}
