import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function getBackendToken(req: NextRequest): Promise<string | null> {
  const cookieValue = req.cookies.get("next-auth.session-token")?.value;
  console.log("[getBackendToken] cookie exists:", !!cookieValue);

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: "next-auth.session-token",
  });

  console.log("[getBackendToken] token:", token ? "found" : "null");
  console.log("[getBackendToken] backendToken:", token?.backendToken ? "found" : "null");

  return (token?.backendToken as string) ?? null;
}
