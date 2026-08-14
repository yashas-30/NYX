import React, { memo } from 'react';
import { ChatMessage } from '@src/infrastructure/types';
import { AVAILABLE_MODELS } from '@src/shared/config/models';

interface MessageHeaderProps {
  msg: ChatMessage;
  activeModel?: string;
  isStreaming: boolean;
  isLast: boolean;
  isSetupMessage: boolean;
}

export const MessageHeader: React.FC<MessageHeaderProps> = memo(
  ({ msg, activeModel, isStreaming, isLast, isSetupMessage }) => {
    if (isSetupMessage) return null;

    const rawModel = msg.model || activeModel;
    const messageModel =
      typeof rawModel === 'string'
        ? rawModel
        : rawModel && typeof rawModel === 'object'
          ? ((rawModel as Record<string, string>).id || (rawModel as Record<string, string>).name || '')
          : String(rawModel || '');

    if (!messageModel || String(messageModel).toLowerCase() === 'default') return null;

    const found = AVAILABLE_MODELS.find((m) => m.id === messageModel);
    const displayName = found
      ? found.name
      : rawModel && typeof rawModel === 'object'
        ? ((rawModel as Record<string, string>).name || messageModel)
        : messageModel;

    if (!displayName || String(displayName).toLowerCase() === 'default') return null;

    if (
      !(
        msg.content ||
        msg.reasoning ||
        (msg.toolCalls && msg.toolCalls.length > 0) ||
        msg.status === 'loading'
      )
    ) {
      return null;
    }

    const stateColor =
      msg.status === 'error'
        ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
        : isStreaming && isLast
          ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]'
          : 'bg-violet-400 dark:bg-violet-500 shadow-[0_0_8px_rgba(167,139,250,0.5)]';

    return (
      <div className="flex items-center gap-2 mb-1.5 select-none">
        <div className={`w-1.5 h-1.5 rounded-full ${stateColor}`} />
        <span className="text-[9px] font-mono font-bold text-muted-foreground uppercase tracking-wider">
          {displayName}
        </span>
      </div>
    );
  }
);
MessageHeader.displayName = 'MessageHeader';
