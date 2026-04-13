"use client";

import { FormEvent, useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const IS_DEV = process.env.NODE_ENV === "development";

function LoginContent() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");

  let errorMessage: string | null = null;
  if (errorParam === "InvalidDomain") {
    errorMessage = "Дозволений вхід лише з пошти @knu.ua";
  } else if (errorParam === "OAuthAccountNotLinked") {
    errorMessage = "Цей email вже використовується з іншим способом входу.";
  } else if (errorParam === "CredentialsSignin") {
    errorMessage = "Email повинен бути в домені @knu.ua";
  } else if (errorParam) {
    errorMessage = "Помилка при вході. Спробуйте ще раз.";
  }

  // Dev login state
  const [devEmail, setDevEmail] = useState("");
  const [devLoading, setDevLoading] = useState(false);

  async function handleDevLogin(e: FormEvent) {
    e.preventDefault();
    if (!devEmail.trim()) return;
    setDevLoading(true);
    await signIn("dev-login", {
      email: devEmail.trim(),
      callbackUrl: "/",
      redirect: true,
    });
    setDevLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg dark:bg-zinc-900">
        <h1 className="mb-2 text-center text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          KNU Online Testing
        </h1>
        <p className="mb-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Увійдіть за допомогою корпоративного Google-акаунту (@knu.ua).
        </p>

        {errorMessage && (
          <p
            className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400"
            role="alert"
          >
            {errorMessage}
          </p>
        )}

        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Увійти через Google
        </button>

        <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Ви викладач?{" "}
          <Link
            href="/register"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            Зареєструватися як викладач
          </Link>
        </p>

        <p className="mt-2 text-center text-xs text-zinc-400 dark:text-zinc-500">
          Роль визначається автоматично. Студентам достатньо увійти через Google.
        </p>

        {/* Dev-only login */}
        {IS_DEV && (
          <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-orange-500">
              Dev Mode
            </p>
            <form onSubmit={handleDevLogin} className="flex gap-2">
              <input
                type="email"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                placeholder="student@knu.ua"
                className="flex-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-zinc-900 outline-none focus:border-orange-400 dark:border-orange-800 dark:bg-orange-950/30 dark:text-zinc-50"
              />
              <button
                type="submit"
                disabled={devLoading}
                className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:bg-orange-300"
              >
                {devLoading ? "..." : "Dev Login"}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
