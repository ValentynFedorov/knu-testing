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

/** Parse course number from group string like "КН-21" → "2", "МА-31" → "3" */
function parseCourse(group: string | null | undefined): string | null {
  if (!group) return null;
  const m = group.match(/-(\d)/);
  return m ? m[1] : null;
}

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [activeCourse, setActiveCourse] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

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
        if (updated) fillFormFromStudent(updated);
      }
    } catch (err) {
      console.error(err);
      setError("Не вдалося завантажити студентів");
    } finally {
      setLoading(false);
    }
  }

  // Build course → groups → students structure
  const courseMap = useMemo(() => {
    const map = new Map<string, Map<string, StudentRow[]>>();
    const noGroup: StudentRow[] = [];

    for (const s of students) {
      const grp = s.profile?.group?.trim() || null;
      if (!grp) {
        noGroup.push(s);
        continue;
      }
      const course = parseCourse(grp) ?? "?";
      if (!map.has(course)) map.set(course, new Map());
      const groupMap = map.get(course)!;
      if (!groupMap.has(grp)) groupMap.set(grp, []);
      groupMap.get(grp)!.push(s);
    }

    return { map, noGroup };
  }, [students]);

  const courses = useMemo(() => {
    const keys = Array.from(courseMap.map.keys()).sort();
    if (courseMap.noGroup.length > 0) keys.push("none");
    return keys;
  }, [courseMap]);

  const groups = useMemo(() => {
    if (!activeCourse) return [];
    if (activeCourse === "none") return ["none"];
    const groupMap = courseMap.map.get(activeCourse);
    return groupMap ? Array.from(groupMap.keys()).sort() : [];
  }, [activeCourse, courseMap]);

  const filteredStudents = useMemo(() => {
    if (!activeCourse) return students;
    if (activeCourse === "none") return courseMap.noGroup;
    if (!activeGroup) {
      // Show all students in this course
      const groupMap = courseMap.map.get(activeCourse);
      if (!groupMap) return [];
      return Array.from(groupMap.values()).flat();
    }
    if (activeGroup === "none") return courseMap.noGroup;
    const groupMap = courseMap.map.get(activeCourse);
    return groupMap?.get(activeGroup) ?? [];
  }, [activeCourse, activeGroup, courseMap, students]);

  // Auto-select first course if not set
  useEffect(() => {
    if (!activeCourse && courses.length > 0) {
      setActiveCourse(courses[0]);
    }
  }, [courses, activeCourse]);

  // Auto-select first group when course changes
  useEffect(() => {
    if (groups.length > 0 && !groups.includes(activeGroup ?? "")) {
      setActiveGroup(groups[0]);
    }
  }, [groups, activeGroup]);

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

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
      active
        ? "bg-blue-600 text-white"
        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
    }`;

  return (
    <div className="space-y-4">
      <header className="mb-2">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Студенти
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Керуйте списком студентів та переглядайте їхні результати тестів.
        </p>
      </header>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      {/* Course tabs */}
      {courses.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mr-1">
              Курс:
            </span>
            {courses.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setActiveCourse(c);
                  setActiveGroup(null);
                }}
                className={tabClass(activeCourse === c)}
              >
                {c === "none" ? "Без групи" : `${c} курс`}
              </button>
            ))}
          </div>

          {/* Group sub-tabs */}
          {groups.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mr-1">
                Група:
              </span>
              {groups.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setActiveGroup(g)}
                  className={tabClass(activeGroup === g)}
                >
                  {g === "none" ? "Без групи" : g}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[280px,1fr]">
        {/* Student list */}
        <aside className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Студенти ({filteredStudents.length})
            </h2>
            {loading && (
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                ...
              </span>
            )}
          </div>
          <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
            {filteredStudents.map((s) => {
              const name = s.profile
                ? `${s.profile.lastName} ${s.profile.firstName}`
                : s.email.split("@")[0];
              const avgPct =
                s.attempts.length > 0
                  ? s.attempts.reduce(
                      (sum, a) => sum + (a.percentage != null ? Number(a.percentage) : 0),
                      0,
                    ) / s.attempts.filter((a) => a.percentage != null).length
                  : null;
              return (
                <button
                  key={s.email}
                  type="button"
                  onClick={() => handleSelect(s)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition ${
                    selectedEmail === s.email
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{name}</div>
                    <div className="truncate opacity-80 text-[11px]">
                      {s.profile?.group ?? s.email}
                    </div>
                  </div>
                  {avgPct != null && !isNaN(avgPct) && (
                    <span
                      className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        selectedEmail === s.email
                          ? "bg-white/20"
                          : avgPct >= 60
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}
                    >
                      {avgPct.toFixed(0)}%
                    </span>
                  )}
                </button>
              );
            })}
            {filteredStudents.length === 0 && !loading && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Немає студентів у цій групі.
              </p>
            )}
          </div>
        </aside>

        {/* Student details */}
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
