import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { QuestionBankModule } from './question-bank/question-bank.module';
import { TestsModule } from './tests/tests.module';
import { AttemptsModule } from './attempts/attempts.module';
import { IntegrityModule } from './integrity/integrity.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { StudentsModule } from './students/students.module';
import { MediaModule } from './media/media.module';
import { CodeRunnerModule } from './code-runner/code-runner.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    QuestionBankModule,
    TestsModule,
    AttemptsModule,
    IntegrityModule,
    AnalyticsModule,
    StudentsModule,
    MediaModule,
    CodeRunnerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
