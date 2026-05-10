import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import axios from "axios";

export const runtime = "edge";

const handler = NextAuth({
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
          formData.append("username", credentials?.username || "");
          formData.append("password", credentials?.password || "");

          const res = await axios.post("http://localhost:8000/auth/login", formData);
          
          if (res.data.access_token) {
            // Get user info if needed, but for now we just return the token
            return {
              id: "1", // Dummy id
              email: credentials?.username,
              accessToken: res.data.access_token
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
  secret: process.env.NEXTAUTH_SECRET || "next-auth-secret-change-it",
});

export { handler as GET, handler as POST };
