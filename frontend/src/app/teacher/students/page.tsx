"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

interface CourseView {
  id: string;
  name: string;
  _count: { studentProfiles: number };
}

interface StudentProfileView {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  group?: string | null;
  courseId?: string | null;
  courseName?: string | null;
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
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  // Course creation / editing
  const [newCourseName, setNewCourseName] = useState("");
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingCourseName, setEditingCourseName] = useState("");

  // Form state
  const [emailInput, setEmailInput] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [group, setGroup] = useState("");
  const [courseId, setCourseId] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      setLoading(true);
      setError(null);
      const [studentsRes, coursesRes] = await Promise.all([
        fetch("/api/teacher/students"),
        fetch("/api/teacher/students/courses"),
      ]);
      if (!studentsRes.ok) throw new Error(await studentsRes.text());
      if (!coursesRes.ok) throw new Error(await coursesRes.text());

      const studentsData = (await studentsRes.json()) as StudentRow[];
      const coursesData = (await coursesRes.json()) as CourseView[];

      setStudents(studentsData);
      setCourses(coursesData);

      if (!selectedEmail && studentsData[0]) {
        setSelectedEmail(studentsData[0].email);
        fillFormFromStudent(studentsData[0]);
      } else if (selectedEmail) {
        const updated = studentsData.find((s) => s.email === selectedEmail);
        if (updated) fillFormFromStudent(updated);
      }
    } catch (err) {
      console.error(err);
      setError("Не вдалося завантажити дані");
    } finally {
      setLoading(false);
    }
  }

  // ── Course filtering ──

  const filteredStudents = useMemo(() => {
    let filtered = students;

    if (activeCourseId === "__none__") {
      filtered = filtered.filter((s) => !s.profile?.courseId);
    } else if (activeCourseId) {
      filtered = filtered.filter((s) => s.profile?.courseId === activeCourseId);
    }

    if (activeGroup && activeGroup !== "__all__") {
      filtered = filtered.filter(
        (s) => (s.profile?.group ?? "") === activeGroup,
      );
    }

    return filtered;
  }, [students, activeCourseId, activeGroup]);

  const groupsInCourse = useMemo(() => {
    let subset = students;
    if (activeCourseId === "__none__") {
      subset = subset.filter((s) => !s.profile?.courseId);
    } else if (activeCourseId) {
      subset = subset.filter((s) => s.profile?.courseId === activeCourseId);
    }
    const groups = new Set<string>();
    for (const s of subset) {
      const g = s.profile?.group?.trim();
      if (g) groups.add(g);
    }
    return Array.from(groups).sort();
  }, [students, activeCourseId]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.email === selectedEmail) ?? null,
    [students, selectedEmail],
  );

  // ── Form helpers ──

  function fillFormFromStudent(row: StudentRow | null) {
    if (!row) {
      setEmailInput("");
      setFirstName("");
      setLastName("");
      setMiddleName("");
      setGroup("");
      setCourseId("");
      return;
    }
    setEmailInput(row.email);
    if (row.profile) {
      setFirstName(row.profile.firstName ?? "");
      setLastName(row.profile.lastName ?? "");
      setMiddleName(row.profile.middleName ?? "");
      setGroup(row.profile.group ?? "");
      setCourseId(row.profile.courseId ?? "");
    } else {
      const localPart = row.email.split("@")[0] ?? "";
      const [first, last] = localPart.split("_");
      setFirstName(first ? capitalize(first) : "");
      setLastName(last ? capitalize(last) : "");
      setMiddleName("");
      setGroup("");
      setCourseId("");
    }
  }

  function capitalize(s: string) {
    return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function handleSelect(row: StudentRow) {
    setSelectedEmail(row.email);
    fillFormFromStudent(row);
  }

  // ── Save student profile ──

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
        courseId: courseId || undefined,
      };
      const res = await fetch("/api/teacher/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadAll();
      setSelectedEmail(email);
    } catch (err) {
      console.error(err);
      setError("Не вдалося зберегти профіль студента");
    } finally {
      setSaving(false);
    }
  }

  // ── Course CRUD ──

  async function handleCreateCourse() {
    const name = newCourseName.trim();
    if (!name) return;
    try {
      setCreatingCourse(true);
      const res = await fetch("/api/teacher/students/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewCourseName("");
      await loadAll();
    } catch (err) {
      console.error(err);
      setError("Не вдалося створити курс");
    } finally {
      setCreatingCourse(false);
    }
  }

  async function handleRenameCourse(id: string, name: string) {
    if (!name.trim()) return;
    try {
      const res = await fetch(`/api/teacher/students/courses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingCourseId(null);
      await loadAll();
    } catch (err) {
      console.error(err);
      setError("Не вдалося перейменувати курс");
    }
  }

  async function handleDeleteCourse(id: string) {
    if (!confirm("Видалити курс? Студентів буде відкріплено від цього курсу."))
      return;
    try {
      const res = await fetch(`/api/teacher/students/courses/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      if (activeCourseId === id) setActiveCourseId(null);
      await loadAll();
    } catch (err) {
      console.error(err);
      setError("Не вдалося видалити курс");
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
          Керуйте курсами, списком студентів та переглядайте їхні результати
          тестів.
        </p>
      </header>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      {/* Course management */}
      <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Курси
          </h2>
        </div>

        {/* Course tabs */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveCourseId(null);
              setActiveGroup(null);
            }}
            className={tabClass(activeCourseId === null)}
          >
            Всі
          </button>
          {courses.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1">
              {editingCourseId === c.id ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    type="text"
                    value={editingCourseName}
                    onChange={(e) => setEditingCourseName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameCourse(c.id, editingCourseName);
                      if (e.key === "Escape") setEditingCourseId(null);
                    }}
                    className="w-32 rounded border border-blue-400 bg-white px-2 py-1 text-xs text-zinc-900 outline-none dark:bg-zinc-800 dark:text-zinc-50"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleRenameCourse(c.id, editingCourseName)}
                    className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700"
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingCourseId(null)}
                    className="text-[10px] text-zinc-400 hover:text-zinc-600"
                  >
                    X
                  </button>
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCourseId(c.id);
                      setActiveGroup(null);
                    }}
                    className={tabClass(activeCourseId === c.id)}
                  >
                    {c.name}{" "}
                    <span className="opacity-70">({c._count.studentProfiles})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCourseId(c.id);
                      setEditingCourseName(c.name);
                    }}
                    className="text-[10px] text-zinc-400 hover:text-blue-500"
                    title="Перейменувати курс"
                  >
                    &#9998;
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCourse(c.id)}
                    className="text-[10px] text-zinc-400 hover:text-red-500"
                    title="Видалити курс"
                  >
                    x
                  </button>
                </>
              )}
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              setActiveCourseId("__none__");
              setActiveGroup(null);
            }}
            className={tabClass(activeCourseId === "__none__")}
          >
            Без курсу
          </button>
        </div>

        {/* Group sub-tabs — only when a specific course is selected */}
        {activeCourseId && activeCourseId !== "__none__" && groupsInCourse.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mr-1">
              Група:
            </span>
            <button
              type="button"
              onClick={() => setActiveGroup(null)}
              className={tabClass(!activeGroup)}
            >
              Всі
            </button>
            {groupsInCourse.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setActiveGroup(g)}
                className={tabClass(activeGroup === g)}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {/* Add course inline */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newCourseName}
            onChange={(e) => setNewCourseName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateCourse()}
            placeholder="Назва нового курсу..."
            className="w-48 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
          <button
            type="button"
            onClick={handleCreateCourse}
            disabled={creatingCourse || !newCourseName.trim()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-blue-400"
          >
            {creatingCourse ? "..." : "+ Курс"}
          </button>
        </div>
      </div>

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
                      (sum, a) =>
                        sum +
                        (a.percentage != null ? Number(a.percentage) : 0),
                      0,
                    ) /
                    s.attempts.filter((a) => a.percentage != null).length
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
                      {s.profile?.courseName
                        ? `${s.profile.courseName}${s.profile.group ? ` / ${s.profile.group}` : ""}`
                        : s.profile?.group ?? s.email}
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
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Курс
                </label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
                >
                  <option value="">-- Без курсу --</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
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
                        <tr
                          key={a.attemptId}
                          className="border-t border-zinc-200 dark:border-zinc-800"
                        >
                          <td className="px-3 py-1.5 align-top text-zinc-700 dark:text-zinc-200">
                            {new Date(
                              a.finishedAt ?? a.startedAt,
                            ).toLocaleString()}
                          </td>
                          <td className="px-3 py-1.5 align-top text-zinc-800 dark:text-zinc-50">
                            {a.testName}
                          </td>
                          <td className="px-3 py-1.5 align-top font-mono text-[10px] text-zinc-600 dark:text-zinc-300">
                            {a.token}
                          </td>
                          <td className="px-3 py-1.5 align-top text-zinc-800 dark:text-zinc-100">
                            {a.totalScore != null
                              ? Number(a.totalScore).toFixed(2)
                              : "-"}
                          </td>
                          <td className="px-3 py-1.5 align-top text-zinc-800 dark:text-zinc-100">
                            {a.percentage != null
                              ? Number(a.percentage).toFixed(1)
                              : "-"}
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
