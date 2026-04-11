"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface RunInfo {
  id: string;
  token: string;
  status: string;
  startsAt: string;
  endsAt: string;
  test: {
    id: string;
    name: string;
    description?: string | null;
  };
}

interface SummaryInfo {
  totalStudents: number;
  histogram: { rangeStart: number; rangeEnd: number; count: number }[];
  averageScore: number;
  minScore: number;
  maxScore: number;
  averageTimeSec: number;
  totalViolations: number;
  suspiciousStudents: number;
}

interface StudentRow {
  attemptId: string;
  fullName: string;
  email: string;
  totalScore: number | null;
  percentage: number | null;
  totalTimeSec: number | null;
  violationsCount: number;
  indicators: {
    fullscreenExit: boolean;
    tabSwitch: boolean;
    pasteDetection: boolean;
    screenshot: boolean;
  };
}

interface DashboardResponse {
  run: RunInfo;
  summary: SummaryInfo;
  students: StudentRow[];
}

export default function RunDashboardPage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  async function load() {
    try {
      setLoading(true);
      const res = await fetch(`/api/teacher/analytics/tests/${runId}`);
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as DashboardResponse;
      setData(json);
    } catch (err) {
      console.error(err);
      setError("Не вдалося завантажити аналітику");
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

  const { run, summary, students } = data;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {run.test.name}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Запуск з токеном <span className="font-mono">{run.token}</span>
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            {new Date(run.startsAt).toLocaleString()} — {" "}
            {new Date(run.endsAt).toLocaleString()}
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-zinc-500 dark:text-zinc-400">Студентів</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {summary.totalStudents}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-zinc-500 dark:text-zinc-400">Середній бал</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {Number(summary.averageScore || 0).toFixed(2)}
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {Number(summary.minScore || 0).toFixed(2)} — {Number(summary.maxScore || 0).toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-zinc-500 dark:text-zinc-400">Середній час</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {Math.round(Number(summary.averageTimeSec || 0))} с
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-zinc-500 dark:text-zinc-400">Порушення</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {summary.totalViolations}
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            підозрілих студентів: {summary.suspiciousStudents}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Студенти
        </h2>
        <div className="overflow-x-auto text-xs">
          <table className="min-w-full border-collapse">
            <thead className="bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">ПІБ</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Бал</th>
                <th className="px-3 py-2 text-left">Час</th>
                <th className="px-3 py-2 text-left">Порушення</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.attemptId}
                  className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                  onClick={() =>
                    (window.location.href = `/teacher/results/${runId}/students/${s.attemptId}`)
                  }
                >
                  <td className="px-3 py-2 align-top text-zinc-900 dark:text-zinc-50">
                    {s.fullName}
                  </td>
                  <td className="px-3 py-2 align-top text-zinc-700 dark:text-zinc-200">
                    {s.email}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div>{s.totalScore != null ? Number(s.totalScore).toFixed(2) : "-"}</div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {s.percentage != null ? Number(s.percentage).toFixed(1) : "-"}%
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {s.totalTimeSec ? `${s.totalTimeSec}s` : "-"}
                  </td>
                  <td className="px-3 py-2 align-top text-[11px] text-zinc-500 dark:text-zinc-400">
                    {s.violationsCount} ·
                    {" "}
                    {s.indicators.fullscreenExit && "FS "}
                    {s.indicators.tabSwitch && "TAB "}
                    {s.indicators.pasteDetection && "PASTE "}
                    {s.indicators.screenshot && "SCREEN"}
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400"
                  >
                    Немає студентів для цього запуску.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
