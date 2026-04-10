import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

if (!BACKEND_URL) {
  throw new Error("NEXT_PUBLIC_BACKEND_URL is not configured");
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const backendToken = token?.backendToken as string | undefined;
  if (!backendToken) return new NextResponse("Unauthorized", { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return new NextResponse("Missing file", { status: 400 });
  }

  const backendForm = new FormData();
  backendForm.set("file", file);

  const res = await fetch(`${BACKEND_URL}/media/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${backendToken}`,
    },
    body: backendForm,
  });

  const text = await res.text();
  return new NextResponse(text, { status: res.status });
}
