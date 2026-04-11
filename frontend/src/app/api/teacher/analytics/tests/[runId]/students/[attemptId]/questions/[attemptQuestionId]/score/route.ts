import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

if (!BACKEND_URL) {
  throw new Error("NEXT_PUBLIC_BACKEND_URL is not configured");
}

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      runId: string;
      attemptId: string;
      attemptQuestionId: string;
    }>;
  }
) {
  const { runId, attemptId, attemptQuestionId } = await params;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const backendToken = token?.backendToken as string | undefined;
  if (!backendToken) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json();

  const res = await fetch(
    `${BACKEND_URL}/analytics/tests/${runId}/students/${attemptId}/questions/${attemptQuestionId}/score`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${backendToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const text = await res.text();
  return new NextResponse(text, { status: res.status });
}
