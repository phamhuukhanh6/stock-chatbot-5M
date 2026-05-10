"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot, LogIn } from "lucide-react";

export const runtime = "edge";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await signIn("credentials", {
      username: email,
      password: password,
      redirect: false,
    });

    if (result?.error) {
      setError("Email hoặc mật khẩu không đúng.");
    } else {
      router.push("/");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-black shadow-lg">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">Đăng nhập</h2>
          <p className="mt-2 text-sm text-gray-500">Chào mừng bạn quay lại với VNStock 5M AI</p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <input
                type="email"
                required
                className="relative block w-full rounded-2xl border-0 bg-gray-50 px-4 py-3 text-gray-900 ring-1 ring-inset ring-gray-200 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-black sm:text-sm sm:leading-6"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <input
                type="password"
                required
                className="relative block w-full rounded-2xl border-0 bg-gray-50 px-4 py-3 text-gray-900 ring-1 ring-inset ring-gray-200 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-black sm:text-sm sm:leading-6"
                placeholder="Mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-center text-xs font-bold text-red-500 uppercase tracking-tight">{error}</p>}

          <div>
            <button
              type="submit"
              className="group relative flex w-full justify-center rounded-2xl bg-black px-4 py-4 text-sm font-bold text-white transition-all hover:bg-gray-800 active:scale-95 shadow-xl"
            >
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <LogIn className="h-4 w-4 text-gray-400 group-hover:text-white" />
              </span>
              ĐĂNG NHẬP
            </button>
          </div>

          <div className="text-center">
            <Link href="/register" className="text-xs font-bold text-gray-400 uppercase tracking-widest hover:text-black transition-colors">
              Chưa có tài khoản? Đăng ký ngay
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
