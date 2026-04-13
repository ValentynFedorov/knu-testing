"use client";

import { ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function TeacherLayout({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role as string | undefined;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "authenticated" && role !== "TEACHER") {
      router.replace("/");
    }
  }, [status, role, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-zinc-500">Завантаження...</p>
      </div>
    );
  }

  if (status !== "authenticated" || role !== "TEACHER") {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <aside className="hidden w-60 flex-col border-r border-zinc-200 bg-white px-4 py-6 text-sm dark:border-zinc-800 dark:bg-zinc-950 md:flex">
        <h1 className="mb-6 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Викладач
        </h1>
        <nav className="space-y-2">
          <a
            href="/teacher/question-bank"
            className="block rounded-lg px-3 py-2 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Банк питань
          </a>
          <a
            href="/teacher/tests"
            className="block rounded-lg px-3 py-2 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Тести
          </a>
          <a
            href="/teacher/results"
            className="block rounded-lg px-3 py-2 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Результати
          </a>
          <a
            href="/teacher/students"
            className="block rounded-lg px-3 py-2 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Студенти
          </a>
          <a
            href="/teacher/admin"
            className="block rounded-lg px-3 py-2 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Викладачі
          </a>
        </nav>
      </aside>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col p-4 py-6">
        {children}
      </main>
    </div>
  );
}
