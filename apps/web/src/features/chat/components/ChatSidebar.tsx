import React from 'react';
import { useTranslation } from 'react-i18next';

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

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  isOpen,
  onClose,
  sessions,
  onSelectSession,
  onNewSession,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <aside className="h-screen w-[280px] flex-shrink-0 flex flex-col justify-between bg-surface-container-low py-lg px-md z-10 transition-all duration-300">
      <div className="flex flex-col gap-md">
        {/* Primary Action */}
        <button 
          onClick={onNewSession}
          className="w-full flex items-center justify-between gap-sm bg-surface-container-highest text-on-surface rounded-full py-3 px-4 hover:bg-surface-variant transition-all duration-200 shadow-sm"
        >
          <span className="font-body-md font-medium">{t('new_chat', 'New chat')}</span>
          <span className="material-symbols-outlined text-[20px]">edit</span>
        </button>
        
        {/* Navigation Tabs */}
        <nav className="flex flex-col gap-xs mt-2">
          <a className="flex items-center gap-md bg-secondary-container text-on-secondary-container rounded-full px-4 py-2.5 transition-all duration-200" href="#">
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: '"FILL" 1' }}>history</span>
            <span className="font-body-md font-medium">History</span>
          </a>
          <a className="flex items-center gap-md text-on-surface-variant hover:bg-surface-variant/50 px-4 py-2.5 rounded-full transition-all duration-200" href="#">
            <span className="material-symbols-outlined text-[20px]">view_cozy</span>
            <span className="font-body-md font-medium">Templates</span>
          </a>
          <a className="flex items-center gap-md text-on-surface-variant hover:bg-surface-variant/50 px-4 py-2.5 rounded-full transition-all duration-200" href="#">
            <span className="material-symbols-outlined text-[20px]">library_books</span>
            <span className="font-body-md font-medium">Library</span>
          </a>
        </nav>
        
        {/* Recent Chats */}
        <div className="flex flex-col gap-sm mt-md">
          <span className="font-label-mono text-[11px] text-outline uppercase tracking-wider px-sm flex items-center gap-xs">
            Recent
          </span>
          <div className="flex flex-col gap-xs overflow-y-auto max-h-[307px] pr-xs custom-scrollbar">
            {sessions.map((session) => (
              <a 
                key={session.id}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onSelectSession(session.id);
                }}
                className="flex items-center gap-3 text-on-surface-variant hover:bg-surface-variant/50 px-4 py-2 rounded-full font-body-md text-[13px] transition-colors"
              >
                <span className="material-symbols-outlined text-[16px] opacity-70">chat_bubble</span>
                <span className="truncate">{session.title}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
      
      {/* Footer Actions */}
      <div className="flex flex-col gap-xs pt-md gap-md">
        <a className="flex items-center gap-md text-on-surface-variant hover:bg-surface-variant/50 px-4 py-2.5 rounded-full transition-all duration-200" href="#">
          <span className="material-symbols-outlined text-[20px]">settings</span>
          <span className="font-body-md font-medium">Settings</span>
        </a>
        <a className="flex items-center gap-md text-on-surface-variant hover:bg-surface-variant/50 px-4 py-2.5 rounded-full transition-all duration-200" href="#">
          <span className="material-symbols-outlined text-[20px]">help_outline</span>
          <span className="font-body-md font-medium">Help</span>
        </a>
        
        {/* User Profile Area */}
        <div className="mt-sm flex items-center gap-3 px-4 py-2.5 hover:bg-surface-variant/50 rounded-full cursor-pointer transition-colors">
          <div className="w-8 h-8 rounded-full bg-primary-container text-primary flex items-center justify-center font-bold text-sm">
            PR
          </div>
          <div className="flex flex-col">
            <span className="font-body-md text-[13px] font-medium leading-tight text-on-surface">Pro Researcher</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
