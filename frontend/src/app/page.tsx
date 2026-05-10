"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Send, Bot, User, Loader2, Sparkles } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const API_URL = "https://stock-chatbot-5m-api.phamhuukhanh6.workers.dev";

export const runtime = "edge";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Xin chào! Tôi là Chuyên Gia Tư Vấn Đầu Tư 5M. Bạn đang quan tâm đến mã cổ phiếu nào hay muốn phân tích thị trường hôm nay?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [botType, setBotType] = useState("gemini");
  const [plan, setPlan] = useState("free");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router, mounted]);

  const handleSelectSession = async (sessionId: number) => {
    setLoading(true);
    setActiveSessionId(sessionId);
    try {
      const res = await fetch(`${API_URL}/history/${sessionId}`, {
        headers: { Authorization: `Bearer ${(session as any)?.accessToken}` }
      });
      if (res.ok) {
        setMessages(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch session history:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = (folderId?: number) => {
    setActiveSessionId(null);
    setActiveFolderId(folderId || null);
    setMessages([{ role: "assistant", content: "Phiên chat mới đã sẵn sàng. Tôi có thể giúp gì cho bạn?" }]);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const newMsg: Message = { role: "user", content: input };
    const currentMessages = [...messages, newMsg];
    setMessages(currentMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(session ? { "Authorization": `Bearer ${(session as any)?.accessToken}` } : {})
        },
        body: JSON.stringify({ 
          messages: currentMessages,
          bot_type: botType,
          plan: plan,
          session_id: activeSessionId,
          folder_id: activeFolderId
        })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Lỗi máy chủ.");
      }
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let fullContent = "";

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (!done) {
        const { value, done: doneReading } = await reader!.read();
        done = doneReading;
        if (value) {
            const chunkValue = decoder.decode(value);
            fullContent += chunkValue;
            
            setMessages(prev => {
              const last = prev[prev.length - 1];
              return [...prev.slice(0, -1), { ...last, content: fullContent }];
            });
        }
      }

      if (activeSessionId === null && session) {
        const sessionsRes = await fetch(`${API_URL}/sessions`, {
           headers: { Authorization: `Bearer ${(session as any)?.accessToken}` }
        });
        if (sessionsRes.ok) {
          const data = await sessionsRes.json();
          if (data.length > 0) setActiveSessionId(data[0].id);
        }
      }

    } catch (err: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Lỗi: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted || status === "loading") {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#F9F9F9]">
        <Loader2 className="w-8 h-8 animate-spin text-black" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F9F9F9] overflow-hidden">
      <Sidebar 
        activeSessionId={activeSessionId} 
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
      />
      
      <main className="flex-1 flex flex-col relative">
        <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-black rounded-xl flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
             </div>
             <div>
                <h2 className="text-sm font-bold text-gray-900 tracking-tight">VNStock 5M AI</h2>
                <div className="flex items-center gap-2">
                   <span className="flex h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                   <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Hệ thống sẵn sàng</span>
                </div>
             </div>
          </div>

          <div className="flex items-center gap-3">
             <select 
              value={botType}
              onChange={(e) => setBotType(e.target.value)}
              className="bg-gray-100 border-none rounded-xl px-4 py-2 text-[11px] font-bold text-gray-600 focus:ring-2 focus:ring-black/5 outline-none cursor-pointer hover:bg-gray-200 transition-all"
             >
                <option value="gemini">GEMINI 2.0 FLASH</option>
                <option value="claude">CLAUDE 3.5 SONNET</option>
                <option value="deepseek">DEEPSEEK V3</option>
             </select>
             <div className="px-3 py-1.5 bg-yellow-50 border border-yellow-100 rounded-lg flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-yellow-600" />
                <span className="text-[10px] font-bold text-yellow-700 uppercase tracking-tight">PRO PLAN</span>
             </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="max-w-3xl mx-auto space-y-8">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} items-start gap-4`}>
                {msg.role === "assistant" && (
                  <div className="w-9 h-9 rounded-2xl bg-black flex items-center justify-center shrink-0 shadow-lg mt-1">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-3xl p-5 text-sm leading-relaxed ${
                  msg.role === "user" 
                    ? "bg-black text-white rounded-tr-none shadow-xl" 
                    : "bg-white text-gray-800 border border-gray-100 rounded-tl-none shadow-sm"
                }`}>
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
                {msg.role === "user" && (
                   <div className="w-9 h-9 rounded-2xl bg-gray-200 flex items-center justify-center shrink-0 mt-1">
                    <User className="w-5 h-5 text-gray-600" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start items-center gap-4 animate-pulse">
                <div className="w-9 h-9 rounded-2xl bg-black/10 flex items-center justify-center shrink-0">
                  <Loader2 className="w-4 h-4 animate-spin text-black/40" />
                </div>
                <div className="bg-white border border-gray-100 rounded-3xl rounded-tl-none p-4 px-6">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce delay-150"></span>
                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce delay-300"></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-8 bg-gradient-to-t from-[#F9F9F9] to-transparent sticky bottom-0">
          <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto relative">
            <input
              className="w-full bg-white border border-gray-100 rounded-[2.5rem] pl-8 pr-16 py-5 text-sm shadow-2xl focus:outline-none focus:ring-4 focus:ring-black/5 transition-all"
              placeholder="Hỏi về mã chứng khoán (VD: Phân tích SSI)..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button 
              disabled={loading || !input.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 bg-black text-white rounded-full flex items-center justify-center hover:bg-gray-800 disabled:bg-gray-200 transition-all active:scale-90 shadow-lg"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <p className="text-[10px] text-center text-gray-400 mt-4 font-bold uppercase tracking-widest">AI có thể đưa ra sai sót.</p>
        </div>
      </main>
    </div>
  );
}
