import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

if (!BACKEND_URL) {
  throw new Error("NEXT_PUBLIC_BACKEND_URL is not configured");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await params;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const backendToken = token?.backendToken as string | undefined;
  if (!backendToken) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));

  const res = await fetch(`${BACKEND_URL}/attempts/${attemptId}/finish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${backendToken}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  return new NextResponse(text, { status: res.status });
}
