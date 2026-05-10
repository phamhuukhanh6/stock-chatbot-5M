"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, User, Sparkles, TrendingUp, ShieldAlert, Zap, Cpu, Crown, CreditCard, ChevronDown, Menu } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Xin chào! Tôi là Chuyên gia Tư vấn Đầu tư cao cấp. Bạn đang quan tâm đến mã cổ phiếu nào hay cần tôi nhận định về thị trường?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [botType, setBotType] = useState<"gemini" | "claude" | "openrouter">("gemini");
  const [plan, setPlan] = useState<"free" | "premium" | "max">("free");
  const [showSidebar, setShowSidebar] = useState(true);
  
  // New States for Folder/Session
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSelectSession = async (sessionId: number) => {
    setLoading(true);
    setActiveSessionId(sessionId);
    try {
      const config = { headers: { Authorization: `Bearer ${(session as any)?.accessToken}` } };
      const res = await axios.get(`http://localhost:8000/history/${sessionId}`, config);
      setMessages(res.data);
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
      const res = await fetch("http://localhost:8000/chat", {
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

      // Check if this was a new session and capture ID from headers if backend sends it, 
      // but simpler: refresh sidebar via activeSessionId state trigger
      
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
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].content = fullContent;
            return newMessages;
          });
        }
      }
      
      // If it was a new session, we should probably fetch the latest sessions to find our new ID
      // For now, we rely on the Sidebar's useEffect to refresh
      if (activeSessionId === null && session) {
        // Trigger sidebar refresh by just re-fetching sessions in Sidebar
        // A better way is to return session_id in a header or a separate initial message
        // Simplified for this phase:
        const sessionsRes = await axios.get("http://localhost:8000/sessions", {
           headers: { Authorization: `Bearer ${(session as any)?.accessToken}` }
        });
        if (sessionsRes.data.length > 0) {
          setActiveSessionId(sessionsRes.data[0].id);
        }
      }

    } catch (err: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Lỗi: ${err.message}. Hãy kiểm tra lại API Key hoặc Backend.` }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    { label: "Phân tích mã FPT", icon: <Sparkles className="w-4 h-4" /> },
    { label: "Rủi ro của VIC lúc này?", icon: <ShieldAlert className="w-4 h-4" /> },
    { label: "Top cổ phiếu có Moat mạnh", icon: <TrendingUp className="w-4 h-4" /> },
    { label: "Chiến lược tích sản 2026", icon: <Zap className="w-4 h-4" /> }
  ];

  if (status === "loading") {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-black rounded-2xl"></div>
          <div className="h-2 w-24 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white overflow-hidden text-[#1D1D1F] font-sans">
      {showSidebar && (
        <Sidebar 
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat} 
        />
      )}

      <main className="flex-1 flex flex-col relative">
        {/* Header */}
        <nav className="border-b border-gray-100 py-3 px-6 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center shadow-lg shadow-black/10">
                <Bot className="text-white w-5 h-5" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm font-bold tracking-tight">VNStock AI</h1>
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">
                  {activeFolderId ? `Folder: ${activeFolderId}` : 'Personal Advisor'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status === "unauthenticated" && (
              <button 
                onClick={() => router.push("/login")}
                className="px-4 py-1.5 bg-black text-white rounded-xl text-[10px] font-bold hover:bg-gray-800 transition-all active:scale-95"
              >
                ĐĂNG NHẬP
              </button>
            )}
            <div className="hidden md:flex bg-gray-100 p-1 rounded-xl gap-1">
              <button 
                onClick={() => setBotType("gemini")}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 ${botType === "gemini" ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Cpu className="w-3 h-3" /> GEMINI
              </button>
              <button 
                onClick={() => setBotType("claude")}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 ${botType === "claude" ? "bg-white shadow-sm text-orange-600" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Zap className="w-3 h-3" /> CLAUDE
              </button>
              <button 
                onClick={() => setBotType("openrouter")}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 ${botType === "openrouter" ? "bg-white shadow-sm text-purple-600" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Sparkles className="w-3 h-3" /> DEEPSEEK
              </button>
            </div>

            <div className="relative group">
              <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-100 transition-all">
                <Crown className={`w-3.5 h-3.5 ${plan === 'max' ? 'text-yellow-500' : plan === 'premium' ? 'text-purple-500' : 'text-gray-400'}`} />
                <span className="text-[10px] font-bold uppercase tracking-tight">{plan}</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>
              <div className="absolute right-0 top-full mt-2 w-32 bg-white border border-gray-100 rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all p-1 z-30">
                {["free", "premium", "max"].map((p) => (
                  <button 
                    key={p}
                    onClick={() => setPlan(p as any)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-[10px] font-bold uppercase hover:bg-gray-50 transition-colors ${plan === p ? 'text-blue-600' : 'text-gray-500'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </nav>

        {/* Chat Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-10 space-y-8 max-w-3xl mx-auto w-full scroll-smooth no-scrollbar">
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm ${msg.role === "user" ? "bg-gray-50 border border-gray-100" : "bg-black"}`}>
                  {msg.role === "user" ? <User className="w-4 h-4 text-gray-600" /> : <Bot className="w-4 h-4 text-white" />}
                </div>
                <div className={`max-w-[85%] p-5 rounded-[2rem] text-[15px] leading-relaxed transition-all ${
                  msg.role === "user" 
                    ? "bg-[#F4F4F5] text-gray-800 rounded-tr-none" 
                    : "bg-white text-gray-900 border border-gray-50 shadow-[0_4px_20px_-5px_rgba(0,0,0,0.05)] rounded-tl-none"
                }`}>
                  {msg.role === "user" ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({node, ...props}) => <div className="overflow-x-auto my-4"><table className="min-w-full border-collapse border border-gray-100 rounded-xl overflow-hidden shadow-sm" {...props} /></div>,
                        thead: ({node, ...props}) => <thead className="bg-gray-50" {...props} />,
                        th: ({node, ...props}) => <th className="border-b border-gray-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500" {...props} />,
                        td: ({node, ...props}) => <td className="border-b border-gray-50 px-4 py-3 text-sm text-gray-600" {...props} />,
                        p: ({node, ...props}) => <p className="mb-4 last:mb-0" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
                        li: ({node, ...props}) => <li className="text-sm" {...props} />,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {loading && (
            <div className="flex gap-5">
              <div className="w-9 h-9 rounded-2xl bg-black flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-gray-50 p-5 rounded-[2rem] rounded-tl-none flex gap-1.5 items-center">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-300"></span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-8 bg-gradient-to-t from-white via-white to-transparent">
          <div className="max-w-3xl mx-auto w-full relative">
            {messages.length === 1 && !loading && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-wrap justify-center gap-2 mb-8"
              >
                {suggestions.map((s, i) => (
                  <button 
                    key={i}
                    onClick={() => setInput(s.label)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-gray-100 bg-white shadow-sm text-xs font-semibold hover:border-gray-300 hover:shadow-md transition-all text-gray-600 active:scale-95"
                  >
                    {s.icon} {s.label}
                  </button>
                ))}
              </motion.div>
            )}

            <form onSubmit={handleSendMessage} className="relative group">
              <input 
                type="text" 
                placeholder="Nhập mã chứng khoán hoặc câu hỏi tư vấn..." 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full bg-[#F4F4F5] hover:bg-[#EBEBEB] focus:bg-white rounded-[2rem] px-8 py-6 pr-20 text-[15px] focus:outline-none shadow-[0_0_0_1px_rgba(0,0,0,0.05)] focus:shadow-[0_0_0_2px_rgba(0,0,0,0.1)] transition-all"
              />
              <button 
                type="submit" 
                disabled={!input.trim() || loading}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 bg-black text-white rounded-[1.25rem] flex items-center justify-center hover:bg-gray-800 disabled:bg-gray-300 transition-all shadow-lg active:scale-90"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
