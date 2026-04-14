"use client";

import { FormEvent, useEffect, useState } from "react";

interface Test {
  id: string;
  name: string;
  description?: string | null;
  totalTimeSec?: number | null;
  mode?: "TRAINING" | "EXAM";
  allowMultipleAttempts?: boolean;
  showCorrectAnswersImmediately?: boolean;
  showResultToStudent?: boolean;
  allowBackNavigation?: boolean;
}

interface TestRunSummary {
  id: string;
  token: string;
  status: string;
  startsAt: string;
  endsAt: string;
}

interface QuestionGroup {
  id: string;
  name: string;
}

interface RuleRow {
  groupId: string;
  questionsCount: number;
}

export default function TeacherTestsPage() {
  const [tests, setTests] = useState<Test[]>([]);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [runs, setRuns] = useState<TestRunSummary[]>([]);
  const [groups, setGroups] = useState<QuestionGroup[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);

  const [newTestName, setNewTestName] = useState("");
  const [newTestDesc, setNewTestDesc] = useState("");
  const [newTestTime, setNewTestTime] = useState("");
  const [newTestMode, setNewTestMode] = useState<"TRAINING" | "EXAM">("EXAM");
  const [newAllowMultipleAttempts, setNewAllowMultipleAttempts] = useState(false);
  const [newShowCorrectImmediately, setNewShowCorrectImmediately] = useState(false);
  const [newShowResultToStudent, setNewShowResultToStudent] = useState(false);
  const [newAllowBackNavigation, setNewAllowBackNavigation] = useState(false);

  const [newRunToken, setNewRunToken] = useState("");
  const [newRunStart, setNewRunStart] = useState("");
  const [newRunEnd, setNewRunEnd] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTests();
  }, []);

  useEffect(() => {
    if (newTestMode === "EXAM") {
      setNewAllowMultipleAttempts(false);
      setNewShowCorrectImmediately(false);
    }
  }, [newTestMode]);

  async function loadTests() {
    try {
      setLoading(true);
      const res = await fetch("/api/teacher/tests");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Test[];
      setTests(data);
      if (!selectedTestId && data[0]) {
        selectTest(data[0].id);
      }
    } catch (err) {
      console.error(err);
      setError("Не вдалося завантажити тести");
    } finally {
      setLoading(false);
    }
  }

  async function selectTest(testId: string) {
    setSelectedTestId(testId);
    await Promise.all([loadRuns(testId), loadGroups(), loadRules(testId)]);
  }

  async function loadRules(testId: string) {
    try {
      const res = await fetch(`/api/teacher/tests/${testId}/rules`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { groupId?: string; questionsCount?: number; mode?: string }[];
      setRules(
        data
          .filter((r) => r.mode === "GROUP_RANDOM" && r.groupId)
          .map((r) => ({ groupId: r.groupId!, questionsCount: r.questionsCount ?? 1 })),
      );
    } catch (err) {
      console.error(err);
      setRules([]);
    }
  }

  async function loadRuns(testId: string) {
    try {
      const res = await fetch(`/api/teacher/tests/${testId}/runs`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as any[];
      setRuns(
        data.map((r) => ({
          id: r.id,
          token: r.token,
          status: r.status,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
        })),
      );
    } catch (err) {
      console.error(err);
      setError("Не вдалося завантажити запуски");
    }
  }

  async function loadGroups() {
    try {
      const res = await fetch("/api/teacher/question-groups");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as QuestionGroup[];
      setGroups(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCreateTest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newTestName.trim()) return;
    try {
      const body: any = {
        name: newTestName.trim(),
        mode: newTestMode,
        allowMultipleAttempts: newAllowMultipleAttempts,
        showCorrectAnswersImmediately: newShowCorrectImmediately,
        showResultToStudent: newShowResultToStudent,
        allowBackNavigation: newAllowBackNavigation,
      };
      if (newTestDesc.trim()) body.description = newTestDesc.trim();
      if (newTestTime.trim()) body.totalTimeSec = Number(newTestTime.trim());

      const res = await fetch("/api/teacher/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewTestName("");
      setNewTestDesc("");
      setNewTestTime("");
      setNewTestMode("EXAM");
      setNewAllowMultipleAttempts(false);
      setNewShowCorrectImmediately(false);
      setNewShowResultToStudent(false);
      setNewAllowBackNavigation(false);
      await loadTests();
    } catch (err) {
      console.error(err);
      setError("Не вдалося створити тест");
    }
  }

  function addRuleRow() {
    if (!groups[0]) return;
    setRules((prev) => [...prev, { groupId: groups[0].id, questionsCount: 1 }]);
  }

  function updateRuleRow(index: number, patch: Partial<RuleRow>) {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRuleRow(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveRules() {
    if (!selectedTestId) return;
    setError(null);
    try {
      const rulesPayload = rules.map((r, index) => ({
        mode: "GROUP_RANDOM",
        groupId: r.groupId,
        questionsCount: r.questionsCount,
        orderIndex: index,
      }));
      const res = await fetch(`/api/teacher/tests/${selectedTestId}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: rulesPayload }),
      });
      if (!res.ok) throw new Error(await res.text());
      alert("Правила збережено!");
    } catch (err) {
      console.error(err);
      setError("Не вдалося зберегти правила тесту");
    }
  }

  /** Convert datetime-local value (no tz info) to a full ISO string in the user's local timezone */
  function localDatetimeToISO(dtLocal: string): string {
    // datetime-local gives "2026-04-14T16:10" — create Date treating it as local time
    const d = new Date(dtLocal);
    return d.toISOString();
  }

  async function handleCreateRun(e: FormEvent) {
    e.preventDefault();
    if (!selectedTestId) return;
    setError(null);
    if (!newRunToken.trim() || !newRunStart.trim() || !newRunEnd.trim()) {
      setError("Заповніть токен і часовий інтервал");
      return;
    }
    try {
      const body = {
        token: newRunToken.trim(),
        startsAt: localDatetimeToISO(newRunStart),
        endsAt: localDatetimeToISO(newRunEnd),
      };
      const res = await fetch(`/api/teacher/tests/${selectedTestId}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewRunToken("");
      setNewRunStart("");
      setNewRunEnd("");
      await loadRuns(selectedTestId);
    } catch (err) {
      console.error(err);
      setError("Не вдалося створити запуск тесту");
    }
  }

  async function deleteTest(testId: string) {
    if (
      !confirm(
        "Ви впевнені, що хочете видалити цей тест? Якщо є результати студентів, тест буде приховано зі списку тестів, але результати залишаться у вкладці 'Результати'.",
      )
    )
      return;
    try {
      const res = await fetch(`/api/teacher/tests/${testId}/delete`, {
        method: "POST",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Delete failed");
      }
      setSelectedTestId(null);
      setRuns([]);
      setRules([]);
      await loadTests();
    } catch (err) {
      console.error(err);
      setError(
        "Не вдалося видалити тест. Переконайтесь, що всі запуски вже завершились (дедлайни пройшли).",
      );
    }
  }

  return (
    <div className="space-y-4">
      <header className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Тести
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Створюйте тести, налаштовуйте правила та запуски.
          </p>
        </div>
      </header>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[260px,1fr]">
        <aside className="space-y-4 rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Список тестів
          </h2>
          <div className="space-y-1">
            {tests.map((t) => (
              <div key={t.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => selectTest(t.id)}
                  className={`flex-1 rounded-lg px-3 py-2 text-left text-sm transition ${
                    selectedTestId === t.id
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                  }`}
                >
                  <div className="font-medium">{t.name}</div>
                  {t.description && (
                    <div className="text-xs opacity-80">{t.description}</div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => deleteTest(t.id)}
                  className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                  title="Видалити тест"
                >
                  ✕
                </button>
              </div>
            ))}
            {tests.length === 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Поки що немає жодного тесту.
              </p>
            )}
          </div>

          <form onSubmit={handleCreateTest} className="mt-3 space-y-2 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-800">
            <p className="font-semibold text-zinc-700 dark:text-zinc-200">Новий тест</p>
            <input
              type="text"
              value={newTestName}
              onChange={(e) => setNewTestName(e.target.value)}
className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
              placeholder="Назва тесту"
            />
            <input
              type="text"
              value={newTestDesc}
              onChange={(e) => setNewTestDesc(e.target.value)}
className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
              placeholder="Опис (необов'язково)"
            />
            <input
              type="number"
              min={0}
              value={newTestTime}
              onChange={(e) => setNewTestTime(e.target.value)}
className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
              placeholder="Тривалість (секунди, 0 = без таймера)"
            />
            <div className="space-y-2 pt-1">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200">
                Тип тесту
              </label>
              <select
                value={newTestMode}
                onChange={(e) => setNewTestMode(e.target.value as "TRAINING" | "EXAM")}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              >
                <option value="EXAM">Контрольний</option>
                <option value="TRAINING">Навчальний</option>
              </select>
              <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={newAllowMultipleAttempts}
                  onChange={(e) => setNewAllowMultipleAttempts(e.target.checked)}
                  disabled={newTestMode === "EXAM"}
                />
                Дозволити кілька спроб (лише навчальний)
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={newAllowBackNavigation}
                  onChange={(e) => setNewAllowBackNavigation(e.target.checked)}
                />
                Дозволити повертатися до попередніх питань
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={newShowCorrectImmediately}
                  onChange={(e) => setNewShowCorrectImmediately(e.target.checked)}
                  disabled={newTestMode === "EXAM"}
                />
                Показувати правильні відповіді одразу (лише навчальний)
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={newShowResultToStudent}
                  onChange={(e) => setNewShowResultToStudent(e.target.checked)}
                />
                Показувати результати студенту після завершення
              </label>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Створити тест
            </button>
          </form>
        </aside>

        <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {selectedTestId ? (
            <>
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Правила генерації
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Для простоти зараз підтримується вибір випадкових питань з груп.
                </p>
                <div className="space-y-2">
                  {rules.map((r, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <label className="flex-1">
                        <span className="mb-1 block text-[10px] text-zinc-500 dark:text-zinc-400">Група питань</span>
                        <select
                          value={r.groupId}
                          onChange={(e) =>
                            updateRuleRow(index, { groupId: e.target.value })
                          }
                          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                        >
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="w-24">
                        <span className="mb-1 block text-[10px] text-zinc-500 dark:text-zinc-400">Кількість питань</span>
                        <input
                          type="number"
                          min={1}
                          value={r.questionsCount}
                          onChange={(e) =>
                            updateRuleRow(index, {
                              questionsCount: Number(e.target.value || 1),
                            })
                          }
                          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeRuleRow(index)}
                        className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        Видалити
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addRuleRow}
                    disabled={groups.length === 0}
                    className="rounded-lg border border-dashed border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Додати правило
                  </button>
                  <button
                    type="button"
                    onClick={saveRules}
                    className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700"
                  >
                    Зберегти правила
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Запуски тесту
                </h2>
                <form
                  onSubmit={handleCreateRun}
                  className="flex flex-wrap items-end gap-2 text-xs"
                >
                  <div className="flex-1 min-w-[140px]">
                    <label className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                      Токен
                    </label>
                    <input
                      type="text"
                      value={newRunToken}
                      onChange={(e) => setNewRunToken(e.target.value)}
className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
                      placeholder="Наприклад: ABC123"
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                      Початок
                    </label>
                    <input
                      type="datetime-local"
                      value={newRunStart}
                      onChange={(e) => setNewRunStart(e.target.value)}
className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                      Завершення
                    </label>
                    <input
                      type="datetime-local"
                      value={newRunEnd}
                      onChange={(e) => setNewRunEnd(e.target.value)}
className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Створити запуск
                  </button>
                </form>

                <div className="mt-2 space-y-1 text-xs">
                  {runs.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <div>
                        <div className="font-medium text-zinc-800 dark:text-zinc-100">
                          Токен: {r.token}
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {r.status} · {new Date(r.startsAt).toLocaleString()} — {" "}
                          {new Date(r.endsAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                  {runs.length === 0 && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Поки що немає запусків для цього тесту.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Оберіть тест або створіть новий.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
