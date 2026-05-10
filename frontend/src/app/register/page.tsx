"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot, UserPlus } from "lucide-react";

export const runtime = "edge";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${apiUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName
        })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Đăng ký thất bại");
      }
      
      router.push("/login");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F9F9] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 space-y-8">
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center">
            <Bot className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Tạo tài khoản</h1>
          <p className="text-sm text-gray-400 font-medium">Bắt đầu hành trình đầu tư thông minh</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-500 p-4 rounded-2xl text-xs font-bold border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">Họ và tên</label>
            <input
              required
              className="w-full bg-gray-50 border border-transparent rounded-2xl px-5 py-3.5 text-sm focus:bg-white focus:border-gray-200 focus:outline-none transition-all"
              placeholder="Nguyễn Văn A"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">Email</label>
            <input
              required
              type="email"
              className="w-full bg-gray-50 border border-transparent rounded-2xl px-5 py-3.5 text-sm focus:bg-white focus:border-gray-200 focus:outline-none transition-all"
              placeholder="example@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">Mật khẩu</label>
            <input
              required
              type="password"
              className="w-full bg-gray-50 border border-transparent rounded-2xl px-5 py-3.5 text-sm focus:bg-white focus:border-gray-200 focus:outline-none transition-all"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            disabled={loading}
            className="w-full bg-black text-white rounded-2xl py-4 text-sm font-bold shadow-lg hover:bg-gray-800 transition-all active:scale-[0.98] disabled:bg-gray-300 flex items-center justify-center gap-2"
          >
            {loading ? "ĐANG XỬ LÝ..." : "ĐĂNG KÝ NGAY"}
            <UserPlus className="w-4 h-4" />
          </button>
        </form>

        <div className="text-center">
          <p className="text-xs text-gray-400 font-medium">
            Đã có tài khoản?{" "}
            <Link href="/login" className="text-black font-bold hover:underline">
              Đăng nhập
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
