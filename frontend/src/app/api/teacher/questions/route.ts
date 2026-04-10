import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

if (!BACKEND_URL) {
  throw new Error("NEXT_PUBLIC_BACKEND_URL is not configured");
}

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const backendToken = token?.backendToken as string | undefined;
  if (!backendToken) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");

  const url = new URL(`${BACKEND_URL}/question-bank/questions`);
  if (groupId) url.searchParams.set("groupId", groupId);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${backendToken}`,
    },
  });

  const text = await res.text();
  return new NextResponse(text, { status: res.status });
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const backendToken = token?.backendToken as string | undefined;
  if (!backendToken) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.text();
  const res = await fetch(`${BACKEND_URL}/question-bank/questions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${backendToken}`,
    },
    body,
  });

  const text = await res.text();
  return new NextResponse(text, { status: res.status });
}
