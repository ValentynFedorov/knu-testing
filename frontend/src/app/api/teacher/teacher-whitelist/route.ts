import { NextRequest, NextResponse } from "next/server";
import { getBackendToken } from "@/lib/get-backend-token";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function GET(req: NextRequest) {
  const backendToken = await getBackendToken(req);
  if (!backendToken) return new NextResponse("Unauthorized", { status: 401 });

  const res = await fetch(`${BACKEND_URL}/admin/teacher-whitelist`, {
    headers: { Authorization: `Bearer ${backendToken}` },
  });
  const text = await res.text();
  return new NextResponse(text, { status: res.status });
}

export async function POST(req: NextRequest) {
  const backendToken = await getBackendToken(req);
  if (!backendToken) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.text();
  const res = await fetch(`${BACKEND_URL}/admin/teacher-whitelist`, {
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
