import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const backendToken = token?.backendToken as string | undefined;
  if (!backendToken) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.text();

  try {
    const res = await fetch(`${BACKEND_URL}/code/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${backendToken}`,
      },
      body,
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new NextResponse(
      JSON.stringify({ stderr: "Сервер виконання коду недоступний" }),
      { status: 502 },
    );
  }
}
