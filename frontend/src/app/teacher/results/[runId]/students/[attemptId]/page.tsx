"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import LatexText from "@/lib/LatexText";
function resolveMediaUrl(url?: string | null) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || "";
  return `${base}${url}`;
}

interface QuestionDetail {
  attemptQuestionId: string;
  orderIndex: number;
  questionId: string;
  text: string;
  imageUrl?: string | null;
  type: string;
  weight: number;
  options?: { id: string; label: string; value: string; imageUrl?: string | null }[];
  maxScore: number;
  scoreAwarded: number | null;
  perQuestionTimeSec: number | null;
  startedAt: string | null;
  answeredAt: string | null;
  timeSpentSec: number | null;
  isTimedOut: boolean;
  answer: any;
}

interface ViolationLogRow {
  id: string;
  type: string;
  attemptQuestionId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
}

interface DetailResponse {
  student: {
    id: string;
    fullName: string;
    email: string;
    group?: string;
  };
  test: {
    id: string;
    name: string;
    token: string;
    runId: string;
    startedAt: string | null;
    finishedAt: string | null;
  };
  result: {
    totalScore: number | null;
    percentage: number | null;
  };
  questions: QuestionDetail[];
  violations: ViolationLogRow[];
}

function AnswerDisplay({ question, answer }: { question: QuestionDetail; answer: any }) {
  if (!answer) return <span className="text-zinc-400 text-xs">-</span>;

  if (question.type === "SINGLE_CHOICE" && answer.selectedOptionIds?.length) {
    const optId = answer.selectedOptionIds[0];
    const opt = question.options?.find((o) => o.id === optId);
    return (
      <div className="text-xs text-zinc-700 dark:text-zinc-300">
        {opt?.imageUrl && (
          <img
            src={resolveMediaUrl(opt.imageUrl) ?? undefined}
            alt="option"
            className="mb-1 max-h-24 w-auto rounded-md border border-zinc-200 dark:border-zinc-700"
          />
        )}
        <span className="font-semibold">{opt?.label ?? "?"}.</span> {opt?.value ?? optId}
      </div>
    );
  }

  if (question.type === "GAP_TEXT") {
    if (Array.isArray(answer?.gaps)) {
      const gaps = answer.gaps as { id: string; value: string }[];
      if (gaps.length === 0) {
        return <span className="text-zinc-400 text-xs">-</span>;
      }
      return (
        <ul className="space-y-0.5 text-xs text-zinc-700 dark:text-zinc-300">
          {gaps.map((g) => (
            <li key={g.id}>
              {g.id}: {g.value || "?"}
            </li>
          ))}
        </ul>
      );
    }
    return <span className="text-zinc-400 text-xs">-</span>;
  }

  if (question.type === "MULTIPLE_CHOICE" && answer.selectedOptionIds?.length) {
    return (
      <ul className="text-xs text-zinc-700 dark:text-zinc-300 space-y-1">
        {answer.selectedOptionIds.map((optId: string) => {
          const opt = question.options?.find((o) => o.id === optId);
          return (
            <li key={optId}>
              {opt?.imageUrl && (
                <img
                  src={resolveMediaUrl(opt.imageUrl) ?? undefined}
                  alt="option"
                  className="mb-1 max-h-24 w-auto rounded-md border border-zinc-200 dark:border-zinc-700"
                />
              )}
              <span className="font-semibold">{opt?.label ?? "?"}.</span> {opt?.value ?? optId}
            </li>
          );
        })}
      </ul>
    );
  }

  if (question.type === "OPEN_TEXT") {
    return <div className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{answer.text}</div>;
  }

  if (question.type === "MATCHING") {
    if (Array.isArray(answer?.pairs)) {
      const pairs = answer.pairs as { left: string; right: string | null }[];
      if (pairs.length === 0) {
        return <span className="text-zinc-400 text-xs">-</span>;
      }
      return (
        <ul className="space-y-0.5 text-xs text-zinc-700 dark:text-zinc-300">
          {pairs.map((p, idx) => (
            <li key={idx}>
              {p.left} 
              <span className="text-zinc-400">→</span> {p.right ?? "?"}
            </li>
          ))}
        </ul>
      );
    }
    if (typeof answer.matchingText === "string") {
      return (
        <div className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
          {answer.matchingText}
        </div>
      );
    }
    return <span className="text-zinc-400 text-xs">-</span>;
  }

  return (
    <pre className="overflow-x-auto rounded bg-zinc-900 p-2 text-[11px] text-zinc-100">
      {JSON.stringify(answer, null, 2)}
    </pre>
  );
}

export default function StudentAttemptPage() {
  const params = useParams<{ runId: string; attemptId: string }>();
  const { runId, attemptId } = params;

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, attemptId]);

  async function load() {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/teacher/analytics/tests/${runId}/students/${attemptId}`,
      );
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as DetailResponse;
      setData(json);
    } catch (err) {
      console.error(err);
      setError("Не вдалося завантажити деталі спроби");
    } finally {
      setLoading(false);
    }
  }

  if (!data && loading) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Завантаження...</p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-500" role="alert">
        {error}
      </p>
    );
  }

  if (!data) return null;

  const { student, test, result, questions, violations } = data;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {student.fullName}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {student.email} {student.group ? ` · Група: ${student.group}` : ""}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Тест: {test.name} ({test.token})
          </p>
        </div>
        <div className="text-right text-sm">
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {result.totalScore != null ? Number(result.totalScore).toFixed(2) : "-"}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {result.percentage != null ? Number(result.percentage).toFixed(1) : "-"}%
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-[2fr,1fr]">
        <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Питання
          </h2>
          <div className="space-y-2 text-xs">
            {questions.map((q) => (
              <div
                key={q.attemptQuestionId}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span>
                    #{q.orderIndex + 1} · {q.type}
                  </span>
                  <span>
                    Бал: {q.scoreAwarded != null ? Number(q.scoreAwarded).toFixed(2) : 0}/{Number(q.maxScore).toFixed(2)}
                  </span>
                </div>
                {q.imageUrl && (
                  <img
                    src={resolveMediaUrl(q.imageUrl) ?? undefined}
                    alt="question"
                    className="mb-1 max-h-40 w-auto rounded-md border border-zinc-200 dark:border-zinc-700"
                  />
                )}
                <LatexText
                  text={q.text}
                  className="mb-1 text-xs text-zinc-900 dark:text-zinc-50 whitespace-pre-wrap"
                />
                <div className="mb-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Час: {q.timeSpentSec ?? "-"}с {q.isTimedOut ? "(тайм-аут)" : ""}
                </div>
                <div className="rounded bg-zinc-50 p-2 dark:bg-zinc-900/50">
                  <AnswerDisplay question={q} answer={q.answer} />
                </div>
              </div>
            ))}
            {questions.length === 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Немає питань для цієї спроби.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Порушення
          </h2>
          <div className="space-y-1 text-[11px]">
            {violations.map((v) => (
              <div
                key={v.id}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {v.type}
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {v.durationMs ? `${Math.round(v.durationMs / 1000)}с` : ""}
                  </span>
                </div>
                <div className="text-zinc-500 dark:text-zinc-400">
                  {new Date(v.startedAt).toLocaleString()} — {v.endedAt ? new Date(v.endedAt).toLocaleString() : "?"}
                </div>
                {v.attemptQuestionId && (
                  <div className="text-zinc-500 dark:text-zinc-400">
                    Питання: {v.attemptQuestionId}
                  </div>
                )}
              </div>
            ))}
            {violations.length === 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Порушень не зафіксовано.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
