import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function getBackendToken(req: NextRequest): Promise<string | null> {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: "next-auth.session-token",
    secureCookie: false,
  });
  return (token?.backendToken as string) ?? null;
}
