"use client";

import { MessageSquare, Plus, LogOut, User, FolderPlus, ChevronRight, ChevronDown, Folder, Trash2 } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import axios from "axios";

interface SidebarProps {
  activeSessionId: number | null;
  onSelectSession: (sessionId: number) => void;
  onNewChat: (folderId?: number) => void;
}

export default function Sidebar({ activeSessionId, onSelectSession, onNewChat }: SidebarProps) {
  const { data: session } = useSession();
  const [folders, setFolders] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<number, boolean>>({});
  const [newFolderName, setNewFolderName] = useState("");
  const [showAddFolder, setShowAddFolder] = useState(false);

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session, activeSessionId]);

  const fetchData = async () => {
    try {
      const config = { headers: { Authorization: `Bearer ${(session as any)?.accessToken}` } };
      const [foldersRes, sessionsRes] = await Promise.all([
        axios.get("http://localhost:8000/folders", config),
        axios.get("http://localhost:8000/sessions", config)
      ]);
      setFolders(foldersRes.data);
      setSessions(sessionsRes.data);
    } catch (err) {
      console.error("Failed to fetch sidebar data:", err);
    }
  };

  const handleAddFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const config = { headers: { Authorization: `Bearer ${(session as any)?.accessToken}` } };
      await axios.post("http://localhost:8000/folders", { name: newFolderName }, config);
      setNewFolderName("");
      setShowAddFolder(false);
      fetchData();
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Không thể tạo thư mục. Vui lòng đăng nhập lại.";
      alert(Array.isArray(msg) ? msg[0].msg : msg);
    }
  };

  const toggleFolder = (folderId: number) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const handleDeleteFolder = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Xóa thư mục này sẽ không xóa các đoạn chat bên trong (chúng sẽ ra ngoài hệ thống). Bạn chắc chứ?")) return;
    try {
      const config = { headers: { Authorization: `Bearer ${(session as any)?.accessToken}` } };
      await axios.delete(`http://localhost:8000/folders/${id}`, config);
      fetchData();
    } catch (err) {
      alert("Lỗi khi xóa");
    }
  };

  // Sessions not in any folder
  const rootSessions = sessions.filter(s => !s.folder_id);

  return (
    <div className="w-72 bg-[#F9F9F9] border-r border-gray-100 flex flex-col h-full">
      <div className="p-6 space-y-3">
        <button 
          onClick={() => onNewChat()}
          className="w-full flex items-center gap-3 px-4 py-3 bg-black text-white rounded-2xl text-sm font-bold shadow-lg hover:bg-gray-800 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> CHAT MỚI
        </button>
        
        {session && (
          <>
            <button 
              onClick={() => setShowAddFolder(!showAddFolder)}
              className="w-full flex items-center gap-3 px-4 py-2 bg-white border border-gray-200 rounded-xl text-[11px] font-bold text-gray-500 hover:border-gray-300 transition-all"
            >
              <FolderPlus className="w-3.5 h-3.5" /> TẠO THƯ MỤC
            </button>

            {showAddFolder && (
              <div className="flex gap-2 mt-2">
                <input 
                  autoFocus
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-black/5"
                  placeholder="Tên thư mục..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddFolder()}
                />
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-4 custom-scrollbar">
        {/* Folders Section */}
        <div className="space-y-1">
          {folders.map(folder => (
            <div key={folder.id} className="space-y-1">
              <button 
                onClick={() => toggleFolder(folder.id)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition-all group"
              >
                {expandedFolders[folder.id] ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                <Folder className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[11px] font-bold text-gray-700 flex-1 text-left truncate uppercase tracking-tight">{folder.name}</span>
                <Trash2 
                  onClick={(e) => handleDeleteFolder(e, folder.id)}
                  className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all" 
                />
              </button>
              
              {expandedFolders[folder.id] && (
                <div className="ml-6 space-y-1 border-l border-gray-200 pl-2 py-1">
                   <button 
                    onClick={() => onNewChat(folder.id)}
                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-white text-[10px] font-bold text-gray-400 flex items-center gap-2"
                  >
                    <Plus className="w-3 h-3" /> Chat mới trong folder
                  </button>
                  {sessions.filter(s => s.folder_id === folder.id).map(session_item => (
                    <button 
                      key={session_item.id}
                      onClick={() => onSelectSession(session_item.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-start gap-2 ${activeSessionId === session_item.id ? 'bg-white shadow-sm ring-1 ring-black/5' : 'hover:bg-white/50'}`}
                    >
                      <MessageSquare className={`w-3.5 h-3.5 mt-0.5 ${activeSessionId === session_item.id ? 'text-black' : 'text-gray-300'}`} />
                      <span className={`text-xs truncate ${activeSessionId === session_item.id ? 'font-bold text-black' : 'font-medium text-gray-500'}`}>
                        {session_item.title}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Root Sessions */}
        <div className="space-y-1">
          <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 mt-4">Hội thoại rời</p>
          {rootSessions.length === 0 ? (
             <p className="px-3 py-2 text-[10px] text-gray-300 italic">Trống</p>
          ) : (
            rootSessions.map(session_item => (
              <button 
                key={session_item.id}
                onClick={() => onSelectSession(session_item.id)}
                className={`w-full text-left px-3 py-2 rounded-xl transition-all flex items-start gap-3 ${activeSessionId === session_item.id ? 'bg-white shadow-sm ring-1 ring-black/5 border-l-4 border-l-black' : 'hover:bg-white hover:shadow-sm'}`}
              >
                <MessageSquare className={`w-4 h-4 mt-0.5 ${activeSessionId === session_item.id ? 'text-black' : 'text-gray-400'}`} />
                <span className={`text-xs truncate ${activeSessionId === session_item.id ? 'font-bold text-black' : 'font-medium text-gray-600'}`}>
                  {session_item.title}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="p-4 border-t border-gray-100 bg-white/50">
        {session ? (
          <div className="flex items-center gap-3 p-3 rounded-2xl hover:bg-white transition-all cursor-pointer group">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold border border-gray-200">
              <User className="w-4 h-4 text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-900 truncate">
                {session?.user?.email?.split('@')[0] || "User"}
              </p>
              <p className="text-[10px] text-gray-400 truncate font-medium uppercase tracking-tight">Thành viên</p>
            </div>
            <button 
              onClick={() => signOut()}
              className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="p-3">
            <button 
              onClick={() => (window.location.href = '/login')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-[10px] font-bold transition-all active:scale-95"
            >
              ĐĂNG NHẬP
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
