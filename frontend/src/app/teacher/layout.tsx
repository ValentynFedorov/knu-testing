import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../api/auth/[...nextauth]/route";

export default async function TeacherLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);

  const role = (session?.user as any)?.role as string | undefined;

  if (!session || !session.user || role !== "TEACHER") {
    redirect("/");
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
        </nav>
      </aside>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col p-4 py-6">
        {children}
      </main>
    </div>
  );
}
