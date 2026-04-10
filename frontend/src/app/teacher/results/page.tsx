"use client";

import { useEffect, useState } from "react";

interface TestRunRow {
  testId: string;
  testName: string;
  testDescription?: string | null;
  runId: string;
  token: string;
  status: string;
  startsAt: string;
  endsAt: string;
  studentsStarted: number;
  studentsFinished: number;
  averageScore: number;
  averagePercentage: number;
  totalViolations: number;
}

export default function TeacherResultsPage() {
  const [rows, setRows] = useState<TestRunRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const res = await fetch("/api/teacher/analytics/tests");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as TestRunRow[];
      setRows(data);
    } catch (err) {
      console.error(err);
      setError("Не вдалося завантажити результати");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Результати
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Огляд запусків тестів та підсумкових показників.
          </p>
        </div>
      </header>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full border-collapse">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">Тест</th>
              <th className="px-3 py-2 text-left">Запуск</th>
              <th className="px-3 py-2 text-left">Студенти</th>
              <th className="px-3 py-2 text-left">Середній бал</th>
              <th className="px-3 py-2 text-left">Порушення</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.runId}
                className="cursor-pointer border-t border-zinc-100 text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                onClick={() => (window.location.href = `/teacher/results/${r.runId}`)}
              >
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-zinc-900 dark:text-zinc-50">
                    {r.testName}
                  </div>
                  {r.testDescription && (
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {r.testDescription}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="text-zinc-800 dark:text-zinc-100">Токен: {r.token}</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {r.status} · {new Date(r.startsAt).toLocaleString()} — {" "}
                    {new Date(r.endsAt).toLocaleString()}
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  <div>
                    {r.studentsFinished} / {r.studentsStarted}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    завершили
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  <div>{r.averageScore.toFixed(2)}</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {r.averagePercentage.toFixed(1)}%
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  {r.totalViolations}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400"
                >
                  Поки що немає запусків тестів.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
