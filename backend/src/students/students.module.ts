import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [StudentsService],
  controllers: [StudentsController],
})
export class StudentsModule {}
