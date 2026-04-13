import { NextRequest, NextResponse } from "next/server";
import { getBackendToken } from "@/lib/get-backend-token";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const backendToken = await getBackendToken(req);
  if (!backendToken) return new NextResponse("Unauthorized", { status: 401 });

  const { courseId } = await params;
  const body = await req.text();
  const res = await fetch(`${BACKEND_URL}/students/courses/${courseId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${backendToken}`,
    },
    body,
  });
  return new NextResponse(await res.text(), { status: res.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const backendToken = await getBackendToken(req);
  if (!backendToken) return new NextResponse("Unauthorized", { status: 401 });

  const { courseId } = await params;
  const res = await fetch(`${BACKEND_URL}/students/courses/${courseId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${backendToken}` },
  });
  return new NextResponse(await res.text(), { status: res.status });
}
