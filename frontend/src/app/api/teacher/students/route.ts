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

  try {
    const res = await fetch(`${BACKEND_URL}/students`, {
      headers: {
        Authorization: `Bearer ${backendToken}`,
      },
    });

    const text = await res.text();
    return new NextResponse(text, { status: res.status });
  } catch (err) {
    console.error("Failed to fetch /students from backend", err);
    return new NextResponse("Backend unavailable", { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const backendToken = token?.backendToken as string | undefined;
  if (!backendToken) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.text();

  try {
    const res = await fetch(`${BACKEND_URL}/students`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${backendToken}`,
      },
      body,
    });

    const text = await res.text();
    return new NextResponse(text, { status: res.status });
  } catch (err) {
    console.error("Failed to POST /students to backend", err);
    return new NextResponse("Backend unavailable", { status: 502 });
  }
}
