"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface StudentResult {
  attemptId: string;
  totalScore: number | null;
  percentage: number | null;
  totalTimeSec: number | null;
}

function FinishedContent() {
  const params = useSearchParams();
  const attemptId = params.get("attemptId");
  const [result, setResult] = useState<StudentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    (async () => {
      try {
        const res = await fetch(`/api/student/attempts/${attemptId}/result`);
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as StudentResult;
        setResult(json);
      } catch (err) {
        console.error(err);
        setError("Результати недоступні для цього тесту");
      }
    })();
  }, [attemptId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg dark:bg-zinc-900">
        <h1 className="mb-3 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Тест завершено
        </h1>
        {attemptId && result && (
          <>
            <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-300">
              Ваш результат:
            </p>
            <div className="mb-4 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
              <div>
                Бал:{" "}
                <strong>
                  {result.totalScore != null ? Number(result.totalScore).toFixed(2) : "-"}
                </strong>
              </div>
              <div>
                Відсоток:{" "}
                <strong>
                  {result.percentage != null ? Number(result.percentage).toFixed(1) : "-"}%
                </strong>
              </div>
              <div>
                Час:{" "}
                <strong>
                  {result.totalTimeSec != null ? `${result.totalTimeSec}s` : "-"}
                </strong>
              </div>
            </div>
          </>
        )}
        {attemptId && !result && !error && (
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            Завантаження результатів...
          </p>
        )}
        {error && (
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            {error}
          </p>
        )}
        {!attemptId && (
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
            Ваші відповіді збережені. Підсумковий бал і відсоток будуть
            відображені викладачеві в аналітиці.
          </p>
        )}
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Ви можете закрити це вікно.
        </p>
      </main>
    </div>
  );
}

export default function FinishedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Завантаження...</p>
        </div>
      }
    >
      <FinishedContent />
    </Suspense>
  );
}
