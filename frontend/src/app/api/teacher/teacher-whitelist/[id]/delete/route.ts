import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

if (!BACKEND_URL) {
  throw new Error("NEXT_PUBLIC_BACKEND_URL is not configured");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const backendToken = token?.backendToken as string | undefined;
  if (!backendToken) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const res = await fetch(`${BACKEND_URL}/admin/teacher-whitelist/${id}/delete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${backendToken}` },
  });
  const text = await res.text();
  return new NextResponse(text, { status: res.status });
}
