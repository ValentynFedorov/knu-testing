"use client";

import { FormEvent, useEffect, useState } from "react";

interface WhitelistEntry {
  id: string;
  email: string;
  createdAt: string;
}

export default function TeacherAdminPage() {
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/teacher/teacher-whitelist");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as WhitelistEntry[];
      setEntries(data);
    } catch (err) {
      console.error(err);
      setError("Не вдалося завантажити список викладачів");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const email = newEmail.trim().toLowerCase();
    if (!email) return;

    if (!email.includes("@")) {
      setError("Введіть коректний email");
      return;
    }

    try {
      const res = await fetch("/api/teacher/teacher-whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      setNewEmail("");
      setSuccess(`${email} додано до списку викладачів`);
      await load();
    } catch (err: any) {
      console.error(err);
      if (err?.message?.includes("already")) {
        setError("Цей email вже є у списку");
      } else {
        setError("Не вдалося додати викладача");
      }
    }
  }

  async function handleRemove(entry: WhitelistEntry) {
    if (
      !confirm(
        `Видалити ${entry.email} зі списку викладачів? При наступному вході цей користувач отримає роль студента.`,
      )
    )
      return;

    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/teacher/teacher-whitelist/${entry.id}/delete`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(await res.text());
      setSuccess(`${entry.email} видалено зі списку`);
      await load();
    } catch (err) {
      console.error(err);
      setError("Не вдалося видалити викладача");
    }
  }

  return (
    <div className="space-y-4">
      <header className="mb-2">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Управління викладачами
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Додавайте email-адреси, які матимуть роль викладача при вході в
          систему.
        </p>
      </header>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-600" role="status">
          {success}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr,320px]">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Список викладачів
          </h2>

          {loading && entries.length === 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Завантаження...
            </p>
          )}

          {entries.length === 0 && !loading && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Список порожній. Будь-який @knu.ua email буде входити як студент.
            </p>
          )}

          <div className="space-y-1">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800"
              >
                <div>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {entry.email}
                  </span>
                  <span className="ml-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                    додано{" "}
                    {new Date(entry.createdAt).toLocaleDateString("uk-UA")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(entry)}
                  className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                  title="Видалити"
                >
                  Видалити
                </button>
              </div>
            ))}
          </div>
        </section>

        <aside className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Додати викладача
          </h2>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Email
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:ring-blue-900/40"
                placeholder="teacher@knu.ua"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Додати
            </button>
          </form>

          <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <p className="font-medium text-zinc-700 dark:text-zinc-200">
              Як це працює?
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>
                Email зі списку отримує роль <strong>Викладач</strong> при вході.
              </li>
              <li>
                Всі інші @knu.ua — автоматично <strong>Студент</strong>.
              </li>
              <li>Зміна ролі діє з наступного входу користувача.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
