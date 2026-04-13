import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CodeRunnerService } from './code-runner.service';
import { CodeRunnerController } from './code-runner.controller';

@Module({
  imports: [AuthModule],
  providers: [CodeRunnerService],
  controllers: [CodeRunnerController],
})
export class CodeRunnerModule {}
