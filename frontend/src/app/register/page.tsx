"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Введіть корпоративну пошту");
      return;
    }

    if (!email.trim().endsWith("@knu.ua")) {
      setError("Email повинен бути в домені @knu.ua");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${BACKEND_URL}/auth/register-teacher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Помилка реєстрації");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка реєстрації. Спробуйте ще раз.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg dark:bg-zinc-900">
          <h1 className="mb-2 text-center text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Реєстрація успішна
          </h1>
          <p className="mb-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Ваш акаунт викладача створено. Тепер ви можете увійти.
          </p>
          <Link
            href="/login"
            className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Перейти до входу
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg dark:bg-zinc-900">
        <h1 className="mb-2 text-center text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Реєстрація викладача
        </h1>
        <p className="mb-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Вкажіть вашу корпоративну пошту для створення акаунту викладача.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Корпоративна пошта
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none ring-0 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 dark:focus:bg-zinc-800 dark:focus:ring-blue-900/40"
              placeholder="name_surname@knu.ua"
            />
          </div>
          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
          >
            {loading ? "Реєстрація..." : "Зареєструватися"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Вже маєте акаунт?{" "}
          <Link href="/login" className="text-blue-600 hover:underline dark:text-blue-400">
            Увійти
          </Link>
        </p>
      </main>
    </div>
  );
}
