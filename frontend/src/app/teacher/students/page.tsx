"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

interface StudentProfileView {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  group?: string | null;
}

interface StudentAttemptView {
  attemptId: string;
  testName: string;
  runId: string;
  token: string;
  startedAt: string;
  finishedAt: string | null;
  totalScore: number | null;
  percentage: number | null;
}

interface StudentRow {
  email: string;
  profile: StudentProfileView | null;
  attempts: StudentAttemptView[];
}

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [emailInput, setEmailInput] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [group, setGroup] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/teacher/students");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as StudentRow[];
      setStudents(data);
      if (!selectedEmail && data[0]) {
        setSelectedEmail(data[0].email);
        fillFormFromStudent(data[0]);
      } else if (selectedEmail) {
        const updated = data.find((s) => s.email === selectedEmail);
        if (updated) {
          fillFormFromStudent(updated);
        }
      }
    } catch (err) {
      console.error(err);
      setError("Не вдалося завантажити студентів");
    } finally {
      setLoading(false);
    }
  }

  const selectedStudent = useMemo(
    () => students.find((s) => s.email === selectedEmail) ?? null,
    [students, selectedEmail],
  );

  function fillFormFromStudent(row: StudentRow | null) {
    if (!row) {
      setEmailInput("");
      setFirstName("");
      setLastName("");
      setMiddleName("");
      setGroup("");
      return;
    }
    setEmailInput(row.email);
    if (row.profile) {
      setFirstName(row.profile.firstName ?? "");
      setLastName(row.profile.lastName ?? "");
      setMiddleName(row.profile.middleName ?? "");
      setGroup(row.profile.group ?? "");
    } else {
      // Try to derive name from email as a hint
      const localPart = row.email.split("@")[0] ?? "";
      const [first, last] = localPart.split("_");
      setFirstName(first ? capitalize(first) : "");
      setLastName(last ? capitalize(last) : "");
      setMiddleName("");
      setGroup("");
    }
  }

  function capitalize(s: string) {
    return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function handleSelect(row: StudentRow) {
    setSelectedEmail(row.email);
    fillFormFromStudent(row);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const email = emailInput.trim().toLowerCase();
    if (!email) {
      setError("Введіть email студента");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError("Введіть ім'я та прізвище студента");
      return;
    }

    try {
      setSaving(true);
      const body = {
        email,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        middleName: middleName.trim() || undefined,
        group: group.trim() || undefined,
      };
      const res = await fetch("/api/teacher/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
      setSelectedEmail(email);
    } catch (err) {
      console.error(err);
      setError("Не вдалося зберегти профіль студента");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Студенти
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Керуйте списком студентів та переглядайте їхні результати тестів.
          </p>
        </div>
      </header>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[260px,1fr]">
        <aside className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Список студентів
            </h2>
            {loading && (
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Завантаження...
              </span>
            )}
          </div>
          <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1">
            {students.map((s) => {
              const name = s.profile
                ? `${s.profile.lastName} ${s.profile.firstName}`
                : s.email.split("@")[0];
              return (
                <button
                  key={s.email}
                  type="button"
                  onClick={() => handleSelect(s)}
                  className={`flex w-full flex-col rounded-lg px-3 py-2 text-left text-xs transition ${
                    selectedEmail === s.email
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                  }`}
                >
                  <span className="font-medium truncate">{name}</span>
                  <span className="truncate opacity-80">{s.email}</span>
                  {s.profile?.group && (
                    <span className="text-[11px] opacity-80">Група: {s.profile.group}</span>
                  )}
                </button>
              );
            })}
            {students.length === 0 && !loading && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Поки що немає студентів. Додайте перший профіль праворуч.
              </p>
            )}
          </div>
        </aside>

        <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid gap-4 md:grid-cols-2">
            <form onSubmit={handleSubmit} className="space-y-3 text-sm">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Профіль студента
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Email використовується для зв'язку спроб тестів зі студентом.
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Email
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
                  placeholder="name_surname@knu.ua"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Ім'я
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Прізвище
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    По батькові
                  </label>
                  <input
                    type="text"
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Група
                  </label>
                  <input
                    type="text"
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
                    placeholder="Наприклад: КН-11"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="mt-1 w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                {saving ? "Збереження..." : "Зберегти профіль"}
              </button>
            </form>

            <div className="space-y-2 text-xs">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Результати студента
              </h2>
              {!selectedStudent && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Оберіть студента ліворуч, щоб переглянути його результати.
                </p>
              )}
              {selectedStudent && (
                <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                  <table className="min-w-full border-collapse text-[11px]">
                    <thead className="bg-zinc-100 text-[10px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                      <tr>
                        <th className="px-3 py-2 text-left">Дата</th>
                        <th className="px-3 py-2 text-left">Тест</th>
                        <th className="px-3 py-2 text-left">Токен</th>
                        <th className="px-3 py-2 text-left">Бал</th>
                        <th className="px-3 py-2 text-left">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStudent.attempts.map((a) => (
                        <tr key={a.attemptId} className="border-t border-zinc-200 dark:border-zinc-800">
                          <td className="px-3 py-1.5 align-top text-zinc-700 dark:text-zinc-200">
                            {new Date(a.finishedAt ?? a.startedAt).toLocaleString()}
                          </td>
                          <td className="px-3 py-1.5 align-top text-zinc-800 dark:text-zinc-50">
                            {a.testName}
                          </td>
                          <td className="px-3 py-1.5 align-top font-mono text-[10px] text-zinc-600 dark:text-zinc-300">
                            {a.token}
                          </td>
                          <td className="px-3 py-1.5 align-top text-zinc-800 dark:text-zinc-100">
                            {a.totalScore != null ? Number(a.totalScore).toFixed(2) : "-"}
                          </td>
                          <td className="px-3 py-1.5 align-top text-zinc-800 dark:text-zinc-100">
                            {a.percentage != null ? Number(a.percentage).toFixed(1) : "-"}
                          </td>
                        </tr>
                      ))}
                      {selectedStudent.attempts.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-3 py-3 text-center text-xs text-zinc-500 dark:text-zinc-400"
                          >
                            Поки що немає спроб цього студента.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
