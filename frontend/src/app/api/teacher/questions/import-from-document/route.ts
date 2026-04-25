import { NextRequest, NextResponse } from "next/server";
import { getBackendToken } from "@/lib/get-backend-token";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

if (!BACKEND_URL) {
  throw new Error("NEXT_PUBLIC_BACKEND_URL is not configured");
}

export const maxDuration = 120; // allow up to 120s for AI generation

export async function POST(req: NextRequest) {
  const backendToken = await getBackendToken(req);
  if (!backendToken) return new NextResponse("Unauthorized", { status: 401 });

  // Forward the multipart form data as-is to the backend
  const formData = await req.formData();
  const forward = new FormData();
  for (const [key, value] of formData.entries()) {
    forward.append(key, value as any);
  }

  const res = await fetch(`${BACKEND_URL}/question-bank/questions/import-from-document`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${backendToken}`,
    },
    body: forward as any,
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
  });
}
