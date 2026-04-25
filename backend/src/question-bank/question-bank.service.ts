import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionGroupDto } from './dto/create-question-group.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { ImportQuestionsDto, ImportQuestionItemDto } from './dto/import-questions.dto';
import { QuestionType } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';

const CLAUDE_QUESTIONS_PROMPT = `Ти отримаєш навчальний матеріал. Згенеруй питання для тесту в форматі JSON.

Поверни ТІЛЬКИ валідний JSON-масив, без коментарів, без markdown — рівно такий формат:

[
  {
    "type": "SINGLE_CHOICE",
    "text": "Текст питання?",
    "weight": 1,
    "options": [
      { "value": "Варіант A", "isCorrect": true },
      { "value": "Варіант B", "isCorrect": false },
      { "value": "Варіант C", "isCorrect": false },
      { "value": "Варіант D", "isCorrect": false }
    ]
  },
  {
    "type": "MULTIPLE_CHOICE",
    "text": "Виберіть кілька правильних...",
    "weight": 2,
    "options": [
      { "value": "...", "isCorrect": true },
      { "value": "...", "isCorrect": true },
      { "value": "...", "isCorrect": false }
    ]
  },
  {
    "type": "OPEN_TEXT",
    "text": "Напишіть відповідь:",
    "weight": 1,
    "expectedAnswers": ["правильна відповідь", "альтернативне формулювання"],
    "matchingMode": "CASE_INSENSITIVE"
  },
  {
    "type": "MATCHING",
    "text": "Зіставте поняття:",
    "weight": 2,
    "pairs": [
      { "left": "Київ", "right": "Україна" },
      { "left": "Берлін", "right": "Німеччина" }
    ]
  }
]

Правила:
- Підтримувані типи: SINGLE_CHOICE, MULTIPLE_CHOICE, OPEN_TEXT, MATCHING
- weight - це бали за питання (від 0.1 до 10).
- Для SINGLE_CHOICE рівно одна опція має isCorrect=true.
- Для MULTIPLE_CHOICE щонайменше дві опції з isCorrect=true.
- Для OPEN_TEXT matchingMode може бути EXACT, CASE_INSENSITIVE, CONTAINS або REGEX.
- Усе українською мовою (якщо матеріал не іншою мовою).
- Питання повинні охоплювати ключові поняття з матеріалу.
- Питання мають бути чітко сформульовані, без двозначностей.

Згенеруй {N} питань на основі такого матеріалу:

{CONTENT}`;

@Injectable()
export class QuestionBankService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the prompt teachers can copy & paste into Claude */
  getClaudePromptTemplate(): string {
    return CLAUDE_QUESTIONS_PROMPT;
  }

  async createGroup(teacherId: string, dto: CreateQuestionGroupDto) {
    return this.prisma.questionGroup.create({
      data: {
        name: dto.name,
        description: dto.description,
        teacherId,
      },
    });
  }

  async listGroups(teacherId: string) {
    return this.prisma.questionGroup.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createQuestion(teacherId: string, dto: CreateQuestionDto) {
    // Basic validation by type
    if (
      (dto.type === 'SINGLE_CHOICE' || dto.type === 'MULTIPLE_CHOICE') &&
      (!dto.options || dto.options.length === 0)
    ) {
      throw new BadRequestException('Choice questions must have options');
    }
    if (dto.type === 'MATCHING' && !dto.matchingSchema) {
      throw new BadRequestException('Matching questions must have schema');
    }
    if (dto.type === 'GAP_TEXT' && !dto.gapSchema) {
      throw new BadRequestException('Gap text questions must have schema');
    }

    const question = await this.prisma.question.create({
      data: {
        teacherId,
        groupId: dto.groupId,
        type: dto.type as QuestionType,
        text: dto.text,
        imageUrl: dto.imageUrl,
        weight: dto.weight,
        perQuestionTimeSec: dto.perQuestionTimeSec,
        matchingSchema: dto.matchingSchema as any,
        gapSchema: dto.gapSchema as any,
      },
    });

    if (dto.options && dto.options.length > 0) {
      await this.prisma.questionOption.createMany({
        data: dto.options.map((opt) => ({
          questionId: question.id,
          label: opt.label,
          value: opt.value,
          imageUrl: opt.imageUrl,
          isCorrect: opt.isCorrect,
          orderIndex: opt.orderIndex,
        })),
      });
    }

    if (dto.gradingConfig) {
      await this.prisma.questionGradingKey.create({
        data: {
          questionId: question.id,
          rubric: {},
          autoGradingConfig: dto.gradingConfig as any,
        },
      });
    }

    return this.prisma.question.findUnique({
      where: { id: question.id },
      include: {
        options: true,
        gradingKey: true,
      },
    });
  }

  async listQuestions(teacherId: string, groupId?: string) {
    return this.prisma.question.findMany({
      where: {
        teacherId,
        ...(groupId ? { groupId } : {}),
      },
      include: {
        options: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteGroup(teacherId: string, groupId: string) {
    const group = await this.prisma.questionGroup.findUnique({
      where: { id: groupId },
    });
    if (!group || group.teacherId !== teacherId) {
      throw new BadRequestException('Group not found or access denied');
    }
    // Delete questions first (cascade usually handles this but safer to be explicit or rely on schema)
    // Prisma schema doesn't have onDelete: Cascade explicitly set on relations usually, unless configured.
    // Let's rely on Prisma's relation capabilities or manual cleanup.
    // Ideally we should delete questions, which deletes options.
    
    // Check if used in tests
    const usedInRules = await this.prisma.testQuestionRule.count({
      where: { groupId },
    });
    if (usedInRules > 0) {
      throw new BadRequestException('Cannot delete group used in active tests');
    }

    const questions = await this.prisma.question.findMany({ where: { groupId } });
    for (const q of questions) {
      await this.prisma.questionOption.deleteMany({ where: { questionId: q.id } });
      await this.prisma.questionGradingKey.deleteMany({ where: { questionId: q.id } });
      await this.prisma.attemptQuestion.deleteMany({ where: { questionId: q.id } });
    }
    await this.prisma.question.deleteMany({ where: { groupId } });
    
    return this.prisma.questionGroup.delete({
      where: { id: groupId },
    });
  }

  async deleteQuestion(teacherId: string, questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question || question.teacherId !== teacherId) {
      throw new BadRequestException('Question not found or access denied');
    }

    // Check if used in any attempt (integrity/history)
    const usedInAttempts = await this.prisma.attemptQuestion.count({
      where: { questionId },
    });
    if (usedInAttempts > 0) {
      throw new BadRequestException('Cannot delete question that has been answered by students');
    }

    // Check if used in tests rules
    const usedInRules = await this.prisma.testQuestionRule.count({
      where: { questionId },
    });
    if (usedInRules > 0) {
      throw new BadRequestException('Cannot delete question used explicitly in test rules');
    }

    // Delete options and keys
    await this.prisma.questionOption.deleteMany({ where: { questionId } });
    await this.prisma.questionGradingKey.deleteMany({ where: { questionId } });

    return this.prisma.question.delete({
      where: { id: questionId },
    });
  }

  // ---------- Bulk import ----------

  /** Normalize an import item into a CreateQuestionDto shape. */
  private normalizeImportItem(
    item: ImportQuestionItemDto,
    groupId: string,
    fallbackIndex: number,
  ): CreateQuestionDto {
    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const dto: CreateQuestionDto = {
      groupId,
      type: item.type,
      text: item.text,
      weight: typeof item.weight === 'number' && item.weight > 0 ? item.weight : 1,
      perQuestionTimeSec: item.perQuestionTimeSec,
    };

    if (item.type === 'SINGLE_CHOICE' || item.type === 'MULTIPLE_CHOICE') {
      const opts = item.options ?? [];
      if (opts.length < 2) {
        throw new BadRequestException(
          `Question #${fallbackIndex + 1}: choice questions need at least 2 options`,
        );
      }
      const hasCorrect = opts.some((o) => o.isCorrect);
      if (!hasCorrect) {
        throw new BadRequestException(
          `Question #${fallbackIndex + 1}: at least one option must be marked correct`,
        );
      }
      if (item.type === 'SINGLE_CHOICE' && opts.filter((o) => o.isCorrect).length !== 1) {
        throw new BadRequestException(
          `Question #${fallbackIndex + 1}: SINGLE_CHOICE must have exactly one correct option`,
        );
      }
      dto.options = opts.map((o, i) => ({
        label: o.label || labels[i] || `Option ${i + 1}`,
        value: o.value,
        isCorrect: !!o.isCorrect,
        orderIndex: i,
      }));
    } else if (item.type === 'MATCHING') {
      const pairs = item.pairs ?? [];
      if (pairs.length < 2) {
        throw new BadRequestException(
          `Question #${fallbackIndex + 1}: matching needs at least 2 pairs`,
        );
      }
      const schema: Record<string, string> = {};
      for (const p of pairs) {
        schema[p.left] = p.right;
      }
      dto.matchingSchema = schema;
    } else if (item.type === 'OPEN_TEXT') {
      const expectedAnswers = (item.expectedAnswers ?? [])
        .map((s) => (s ?? '').trim())
        .filter((s) => s.length > 0);
      dto.gradingConfig = {
        format: 'SHORT_TEXT',
        matchingMode: item.matchingMode || 'CASE_INSENSITIVE',
        expectedAnswers,
      };
    }

    return dto;
  }

  /** Bulk-create questions from an array of import items. */
  async importQuestions(teacherId: string, dto: ImportQuestionsDto) {
    const group = await this.prisma.questionGroup.findUnique({
      where: { id: dto.groupId },
    });
    if (!group || group.teacherId !== teacherId) {
      throw new BadRequestException('Group not found or access denied');
    }

    if (!Array.isArray(dto.questions) || dto.questions.length === 0) {
      throw new BadRequestException('No questions to import');
    }

    const created: { id: string; text: string; type: string }[] = [];
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < dto.questions.length; i++) {
      try {
        const normalized = this.normalizeImportItem(dto.questions[i], dto.groupId, i);
        const q = await this.createQuestion(teacherId, normalized);
        if (q) {
          created.push({ id: q.id, text: q.text, type: q.type as string });
        }
      } catch (err: any) {
        errors.push({ index: i, error: err.message || String(err) });
      }
    }

    return {
      createdCount: created.length,
      errorCount: errors.length,
      created,
      errors,
    };
  }

  // ---------- Document → questions via Claude ----------

  /**
   * Extract plain text from an uploaded PDF or DOCX buffer.
   */
  private async extractTextFromDocument(
    buffer: Buffer,
    mimeType: string | undefined,
    filename: string | undefined,
  ): Promise<string> {
    const lowerName = (filename || '').toLowerCase();
    const isPdf =
      mimeType === 'application/pdf' || lowerName.endsWith('.pdf');
    const isDocx =
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.docx');

    if (isPdf) {
      // pdf-parse v2 exports a class
      const mod: any = await import('pdf-parse');
      const PDFParseCtor = mod.PDFParse || mod.default?.PDFParse || mod.default;
      if (!PDFParseCtor) {
        throw new BadRequestException('PDF parser is unavailable');
      }
      const parser = new PDFParseCtor({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        const pages = result?.pages || [];
        const concatenated =
          (result?.text as string | undefined) ||
          pages.map((p: any) => p?.text || '').join('\n\n');
        return (concatenated || '').trim();
      } finally {
        try {
          await parser.destroy();
        } catch {
          // ignore
        }
      }
    }
    if (isDocx) {
      const mammoth: any = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return (result?.value || '').trim();
    }
    throw new BadRequestException(
      'Unsupported file type. Upload a PDF or DOCX file.',
    );
  }

  /**
   * Send extracted text to Claude API and parse the resulting JSON array
   * into ImportQuestionItemDto[].
   */
  private async generateQuestionsFromText(
    content: string,
    questionCount: number,
  ): Promise<ImportQuestionItemDto[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'ANTHROPIC_API_KEY is not configured on the server',
      );
    }
    if (!content || content.length < 50) {
      throw new BadRequestException(
        'Document is empty or contains too little text to generate questions',
      );
    }

    // Cap content to ~80k chars (well within 200k token limit)
    const trimmed =
      content.length > 80000 ? content.slice(0, 80000) + '\n\n[... текст обрізано ...]' : content;
    const n = Math.max(1, Math.min(50, questionCount || 10));

    const prompt = CLAUDE_QUESTIONS_PROMPT
      .replace('{N}', String(n))
      .replace('{CONTENT}', trimmed);

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    // Extract text from response
    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim();

    // Find JSON array in the text — Claude sometimes wraps in code fences
    let jsonText = text;
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonText = fenceMatch[1].trim();
    } else {
      const arrayStart = text.indexOf('[');
      const arrayEnd = text.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd > arrayStart) {
        jsonText = text.slice(arrayStart, arrayEnd + 1);
      }
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      throw new BadRequestException(
        'Claude returned invalid JSON. Please try again or paste the JSON manually.',
      );
    }
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('Claude response is not a JSON array');
    }
    return parsed as ImportQuestionItemDto[];
  }

  /**
   * Top-level handler for "upload PDF/DOCX → generate questions → import".
   */
  async importFromDocument(
    teacherId: string,
    groupId: string,
    file: { buffer: Buffer; mimetype?: string; originalname?: string },
    questionCount: number,
  ) {
    const group = await this.prisma.questionGroup.findUnique({
      where: { id: groupId },
    });
    if (!group || group.teacherId !== teacherId) {
      throw new BadRequestException('Group not found or access denied');
    }
    if (!file || !file.buffer) {
      throw new BadRequestException('No file uploaded');
    }
    const text = await this.extractTextFromDocument(
      file.buffer,
      file.mimetype,
      file.originalname,
    );
    const questions = await this.generateQuestionsFromText(text, questionCount);
    return this.importQuestions(teacherId, { groupId, questions });
  }
}
