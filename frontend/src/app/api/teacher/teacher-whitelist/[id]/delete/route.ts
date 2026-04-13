import { NextRequest, NextResponse } from "next/server";
import { getBackendToken } from "@/lib/get-backend-token";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const backendToken = await getBackendToken(req);
  if (!backendToken) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const res = await fetch(`${BACKEND_URL}/admin/teacher-whitelist/${id}/delete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${backendToken}` },
  });
  const text = await res.text();
  return new NextResponse(text, { status: res.status });
}
