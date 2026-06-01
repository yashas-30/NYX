import React from 'react';
import { MessageSquare, Plus, PanelLeftClose, Trash2 } from 'lucide-react';

interface ChatSession {
  id: string;
  title: string;
  date: string;
}

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ isOpen, onClose, sessions, onSelectSession, onNewSession }) => {
  if (!isOpen) return null;

  return (
    <div className="w-[240px] h-full bg-[#09090B] border-r border-[rgba(255,255,255,0.06)] flex flex-col flex-shrink-0 transition-all duration-300">
      <div className="p-4 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
        <button 
          onClick={onNewSession}
          className="flex-1 flex items-center justify-center gap-2 bg-[#FF3366]/10 text-[#FF3366] hover:bg-[#FF3366]/20 transition-colors py-2 rounded text-[13px] font-medium border border-[#FF3366]/20 mr-2"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
        <button onClick={onClose} className="p-2 text-[#4A5059] hover:text-[#F8FAFC] transition-colors rounded">
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map((session) => (
          <div 
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className="group flex flex-col p-2 rounded hover:bg-[#18181B] cursor-pointer transition-colors border border-transparent hover:border-[rgba(255,255,255,0.06)] relative"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-[#4A5059] group-hover:text-[#FF3366]" />
              <span className="text-[13px] text-[#dde4e5] group-hover:text-[#F8FAFC] truncate font-medium">
                {session.title}
              </span>
            </div>
            <span className="text-[11px] text-[#4A5059] ml-5.5 mt-0.5">
              {session.date}
            </span>
            <button 
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 hover:text-[#ffb4ab] text-[#4A5059] transition-all"
              onClick={(e) => {
                e.stopPropagation();
                // handle delete
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
