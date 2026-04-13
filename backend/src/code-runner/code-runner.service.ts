import { Injectable, BadRequestException } from '@nestjs/common';

// Piston API language mapping (uses local self-hosted Piston)
const LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
  python: { language: 'python', version: '3.10.0' },
  javascript: { language: 'node', version: '18.15.0' },
  typescript: { language: 'typescript', version: '5.0.3' },
  java: { language: 'java', version: '15.0.2' },
  c: { language: 'gcc', version: '10.2.0' },
  cpp: { language: 'gcc', version: '10.2.0' },
};

const PISTON_API =
  process.env.PISTON_URL || 'http://localhost:2000/api/v2/execute';
const EXECUTION_TIMEOUT = 10000; // 10 seconds max
const MAX_OUTPUT_LENGTH = 5000; // chars

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal: string | null;
  timedOut: boolean;
}

@Injectable()
export class CodeRunnerService {
  async execute(
    code: string,
    language: string,
    stdin?: string,
  ): Promise<ExecuteResult> {
    const langConfig = LANGUAGE_MAP[language.toLowerCase()];
    if (!langConfig) {
      throw new BadRequestException(
        `Мова "${language}" не підтримується. Доступні: ${Object.keys(LANGUAGE_MAP).join(', ')}`,
      );
    }

    if (!code || code.trim().length === 0) {
      throw new BadRequestException('Код не може бути порожнім');
    }

    // Limit code size (100KB)
    if (code.length > 100_000) {
      throw new BadRequestException('Код занадто великий (макс. 100KB)');
    }

    const fileExt = this.getFileExtension(language);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        EXECUTION_TIMEOUT + 2000,
      );

      const response = await fetch(PISTON_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          language: langConfig.language,
          version: langConfig.version,
          files: [
            {
              name: `main.${fileExt}`,
              content: code,
            },
          ],
          stdin: stdin || '',
        }),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Piston API error: ${response.status} - ${text}`);
      }

      const data = await response.json();

      const run = data.run || {};
      const compile = data.compile || {};

      // If compilation failed, return compile errors
      if (compile.code !== undefined && compile.code !== 0) {
        return {
          stdout: this.truncate(compile.stdout || ''),
          stderr: this.truncate(compile.stderr || 'Помилка компіляції'),
          exitCode: compile.code ?? 1,
          signal: compile.signal || null,
          timedOut: false,
        };
      }

      return {
        stdout: this.truncate(run.stdout || ''),
        stderr: this.truncate(run.stderr || ''),
        exitCode: run.code ?? 0,
        signal: run.signal || null,
        timedOut: run.signal === 'SIGKILL',
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return {
          stdout: '',
          stderr: 'Виконання перевищило ліміт часу (10 секунд)',
          exitCode: 1,
          signal: 'TIMEOUT',
          timedOut: true,
        };
      }
      throw new BadRequestException(
        `Помилка виконання: ${error.message || 'невідома помилка'}`,
      );
    }
  }

  private getFileExtension(language: string): string {
    const extensions: Record<string, string> = {
      python: 'py',
      javascript: 'js',
      typescript: 'ts',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
    };
    return extensions[language.toLowerCase()] || 'txt';
  }

  private truncate(output: string): string {
    if (output.length > MAX_OUTPUT_LENGTH) {
      return (
        output.slice(0, MAX_OUTPUT_LENGTH) +
        '\n... (вивід обрізано, максимум 5000 символів)'
      );
    }
    return output;
  }

  getSupportedLanguages() {
    return Object.keys(LANGUAGE_MAP);
  }
}
