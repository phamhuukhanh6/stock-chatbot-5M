import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const runtime = "edge";

const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          const formData = new FormData();
          formData.append("username", credentials?.username as string || "");
          formData.append("password", credentials?.password as string || "");

          const res = await fetch("https://stock-chatbot-5m-api.phamhuukhanh6.workers.dev/auth/login", {
            method: "POST",
            body: formData
          });
          const data = await res.json();
          
          if (res.ok && data.access_token) {
            return {
              id: "1",
              email: credentials?.username as string,
              accessToken: data.access_token
            };
          }
          return null;
        } catch (e) {
          return null;
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = (user as any).accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      return session;
    }
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "fallback-secret-1234567890",
});

export const { GET, POST } = handlers;
