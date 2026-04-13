import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import jwt from "jsonwebtoken";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
const BACKEND_JWT_SECRET = process.env.NEXTAUTH_SECRET || "fallback-secret";
const IS_DEV = process.env.NODE_ENV === "development";

// Build providers list
const providers: any[] = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    checks: ["none"],
  }),
];

// Dev-only credentials provider for testing
if (IS_DEV) {
  providers.push(
    CredentialsProvider({
      id: "dev-login",
      name: "Dev Login",
      credentials: {
        email: { label: "Email", type: "text" },
      },
      async authorize(credentials) {
        const emailRaw = credentials?.email?.toString().toLowerCase().trim();
        if (!emailRaw || !emailRaw.endsWith("@knu.ua")) {
          throw new Error("Email повинен бути в домені @knu.ua");
        }

        const localPart = emailRaw.split("@")[0] ?? "";
        const segments = localPart.split("_").filter(Boolean);
        const capitalize = (s: string) =>
          s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;

        let derivedName: string;
        if (segments.length >= 2) {
          derivedName = segments.map((p) => capitalize(p)).join(" ");
        } else {
          derivedName = emailRaw;
        }

        // Check role from backend DB
        let role: "TEACHER" | "STUDENT" = "STUDENT";
        try {
          const res = await fetch(
            `${BACKEND_URL}/auth/check-role?email=${encodeURIComponent(emailRaw)}`,
          );
          if (res.ok) {
            const data = await res.json();
            if (data.role === "TEACHER") role = "TEACHER";
          }
        } catch {}

        return { id: emailRaw, email: emailRaw, name: derivedName, role } as any;
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        const email = profile?.email?.toLowerCase();
        if (!email || !email.endsWith("@knu.ua")) {
          return "/login?error=InvalidDomain";
        }
      }
      return true;
    },
    async jwt({ token, user, account, profile }) {
      // Google login
      if (account?.provider === "google" && profile) {
        const email = profile.email?.toLowerCase() ?? "";
        token.email = email;
        token.name = profile.name ?? email;
        token.picture = (profile as any).picture ?? null;

        let role: "TEACHER" | "STUDENT" = "STUDENT";
        try {
          const res = await fetch(
            `${BACKEND_URL}/auth/check-role?email=${encodeURIComponent(email)}`,
          );
          if (res.ok) {
            const data = await res.json();
            if (data.role === "TEACHER") role = "TEACHER";
          }
        } catch {}
        token.role = role;
      }

      // Dev credentials login
      if (account?.provider === "dev-login" && user) {
        token.email = (user as any).email;
        token.name = (user as any).name;
        token.role = (user as any).role;
        token.picture = null;
      }

      // Sign backend JWT
      const backendToken = jwt.sign(
        {
          sub: token.email,
          email: token.email,
          role: token.role,
          name: token.name,
        },
        BACKEND_JWT_SECRET,
        { expiresIn: "7d" },
      );
      token.backendToken = backendToken;
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = (token.picture as string) ?? null;
        (session.user as any).role = token.role;
        (session as any).backendToken = token.backendToken;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  useSecureCookies: false,
  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    csrfToken: {
      name: "next-auth.csrf-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    callbackUrl: {
      name: "next-auth.callback-url",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    state: {
      name: "next-auth.state",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
    pkceCodeVerifier: {
      name: "next-auth.pkce.code_verifier",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
