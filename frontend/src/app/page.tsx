import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import StudentHome from "./student-home";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;

  if (!session) {
    redirect("/login");
  }

  if (role === "TEACHER") {
    redirect("/teacher/question-bank");
  }

  // STUDENT
  return <StudentHome />;
}
