import React from 'react';
import { useTranslation } from 'react-i18next';
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
    <div
      className="w-[clamp(200px,20vw,280px)] h-full bg-secondary/30 border-r border-border flex flex-col flex-shrink-0 transition-all duration-300"
      aria-label="Chat Sidebar"
      role="complementary"
    >
      <div className="p-4 border-b border-border flex items-center justify-between">
        <button
          onClick={onNewSession}
          aria-label={t('new_chat', 'New Chat')}
          className="flex-1 flex items-center justify-center gap-2 bg-foreground text-background hover:bg-foreground/90 transition-colors py-2 rounded-md text-[13px] font-medium mr-2"
        >
          <Plus className="w-4 h-4" />
          {t('new_chat', 'New Chat')}
        </button>
        <button
          onClick={onClose}
          aria-label="Close Sidebar"
          className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className="group flex flex-col p-2 rounded-md hover:bg-muted/40 cursor-pointer transition-colors border border-transparent hover:border-border relative"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent" />
              <span className="text-[13px] text-foreground/90 group-hover:text-foreground truncate font-medium">
                {session.title}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground ml-[22px] mt-0.5">
              {session.date}
            </span>
            <button
              aria-label={`Delete session ${session.title}`}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 hover:text-destructive text-muted-foreground transition-all"
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
