-- CreateEnum
CREATE TYPE "TestMode" AS ENUM ('TRAINING', 'EXAM');

-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'GAP_TEXT';

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "gapSchema" JSONB;

-- AlterTable
ALTER TABLE "Test" ADD COLUMN     "allowMultipleAttempts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mode" "TestMode" NOT NULL DEFAULT 'EXAM',
ADD COLUMN     "showCorrectAnswersImmediately" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showResultToStudent" BOOLEAN NOT NULL DEFAULT false;
