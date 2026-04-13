"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import StudentHome from "./student-home";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role as string | undefined;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "authenticated" && role === "TEACHER") {
      router.replace("/teacher/question-bank");
    }
  }, [status, role, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-zinc-500">Завантаження...</p>
      </div>
    );
  }

  if (status === "authenticated" && role !== "TEACHER") {
    return <StudentHome />;
  }

  return null;
}
