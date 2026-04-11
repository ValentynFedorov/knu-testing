import NextAuth, { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import jwt from "jsonwebtoken";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
const BACKEND_JWT_SECRET = process.env.NEXTAUTH_SECRET || "fallback-secret";

async function checkIsTeacher(email: string): Promise<boolean> {
  if (!BACKEND_URL) return false;
  try {
    const res = await fetch(
      `${BACKEND_URL}/admin/is-teacher?email=${encodeURIComponent(email)}`,
    );
    if (!res.ok) return false;
    const data = await res.json();
    return data.isTeacher === true;
  } catch {
    return false;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: "KNU Account",
      credentials: {
        email: { label: "Корпоративна пошта (@knu.ua)", type: "text" },
      },
      async authorize(credentials) {
        const emailRaw = credentials?.email?.toString().toLowerCase().trim();

        if (!emailRaw || !emailRaw.endsWith("@knu.ua")) {
          throw new Error("Email повинен бути в домені @knu.ua");
        }

        // Derive a human-friendly name from standardized email: "name_surname@knu.ua"
        const localPart = emailRaw.split("@")[0] ?? "";
        const segments = localPart.split("_").filter(Boolean);
        const capitalize = (s: string) =>
          s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;

        let derivedName: string;
        if (segments.length >= 2) {
          const [first, last, ...rest] = segments;
          derivedName = [first, last, ...rest]
            .map((p) => capitalize(p))
            .join(" ");
        } else {
          derivedName = emailRaw;
        }

        // Check the database whitelist to determine role
        const isTeacher = await checkIsTeacher(emailRaw);
        const role: "TEACHER" | "STUDENT" = isTeacher ? "TEACHER" : "STUDENT";

        return {
          id: emailRaw,
          email: emailRaw,
          name: derivedName,
          role,
        } as any;
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const email = (user as any).email?.toLowerCase();
        const role = (user as any).role as "TEACHER" | "STUDENT";
        token.email = email;
        token.role = role;
        token.name = (user as any).name;
      }
      // Sign a plain JWT for backend on every call (so it stays fresh)
      const backendToken = jwt.sign(
        {
          sub: token.email,
          email: token.email,
          role: token.role,
          name: token.name,
        },
        BACKEND_JWT_SECRET,
        { expiresIn: "7d" }
      );
      token.backendToken = backendToken;
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.email = token.email as string;
        (session.user as any).role = token.role;
        (session as any).backendToken = token.backendToken;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
