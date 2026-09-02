import React, { memo, useRef, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Square, Shield, Zap, Presentation, Tv, FileDown } from 'lucide-react';
import { CheckIcon as Check, XIcon as X } from '@animateicons/react/lucide';
import { ChatMessage, ToolCall } from '@src/infrastructure/types';
import { isReasoningModel } from '@src/infrastructure/utils/provider';
import { toast } from '@src/shared/components/ui/sonner';
import { stripResponsePreamble, extractThinkingAndContent } from '../../utils/streamFilter';

import { ThinkingBlock } from '../ThinkingBlock';
import { FourDotsWaveLoader } from '../FourDotsWaveLoader';
import { StreamingCursor } from '../ChatMessageList';
import { MarkdownContent } from '../ChatMessageList';
import { MessageActions } from '../ChatMessageList';
import { FeedbackButtons } from '../ChatMessageList';
import { FileAttachment } from '../ChatMessageList';
import { ImageAttachment } from '../ChatMessageList';

import { MessageHeader } from './MessageHeader';
import { CollapsibleUserText } from './CollapsibleUserText';
import { ErrorRenderer } from './ErrorRenderer';
import { ToolCallRenderer } from './ToolCallRenderer';
import { ImageArtifactCard } from '../ImageArtifactCard';
import { ImageLightbox } from '../ImageLightbox';
import { exportSlidevToPptx } from '../../../artifacts/utils/pptxExporter';
import { parseSlidevMarkdown } from '../../../artifacts/utils/slidevParser';
import {
  compileResponseToSlidev,
  extractSlidevCodeBlock,
  isPresentationPrompt,
  isSlidevContent,
} from '../../../presentation/utils/slidevCompiler';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MessageBubbleProps {
  msg: ChatMessage;
  previousMsg?: ChatMessage;
  index: number;
  isLast: boolean;
  isStreaming: boolean;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
  submitReward?: (id: string, reward: number) => void;
  onEdit?: (index: number, content: string) => void;
  onRegenerate?: (index: number) => void;
  onBranch?: (index: number) => void;
  activeModel?: string;
  onBranchChange?: (index: number, branchOffset: number) => void;
  onArtifactClick?: (artifact: {
    id: string;
    type: string;
    title: string;
    content: string;
    language?: string;
  }) => void;
  approveTool?: (index: number, approvalId: string) => void;
  rejectTool?: (index: number, approvalId: string) => void;
  onPinToggle?: (index: number) => void;
  onOpenLightbox?: (url?: string, prompt?: string, engine?: string) => void;
}

// ---------------------------------------------------------------------------
// Content parsing helpers
// ---------------------------------------------------------------------------

interface ParsedContent {
  parsedReasoning: string;
  parsedContent: string;
}

function parseMessageContent(
  msg: ChatMessage,
  isUser: boolean,
  reasoningEnabled: boolean
): ParsedContent {
  let parsedReasoning = msg.reasoning || '';
  let parsedContent = (msg.content as string) || '';

  // Clean inline tool tags and noise from assistant messages
  if (!isUser && typeof parsedContent === 'string') {
    parsedContent = parsedContent
      .replace(/\[TOOL_RESULT for [^\]]+\]:\s*[\s\S]*?(?=\n\n|\n[A-Z]|$)/g, '')
      .replace(/\[TOOL_ERROR for [^\]]+\]:\s*[\s\S]*?(?=\n\n|\n[A-Z]|$)/g, '')
      .replace(/\*Lucifer Executing Tool:\s*`[^`]+`\.\.\.\*/g, '')
      // Strip the raw ENTITY IMAGE ATTACHMENT instruction block — it is a backend
      // protocol marker not meant for display. The model is instructed to embed
      // the image as a normal ![Caption](url) instead.
      .replace(/\[ENTITY IMAGE ATTACHMENT\][\s\S]*?\[\/ENTITY IMAGE ATTACHMENT\]/g, '')

      // Strip leaked web search injection blocks (may appear in stored messages from old sessions)
      .replace(/^\[LIVE WEB SEARCH RESULTS\][\s\S]*?\[\/LIVE WEB SEARCH RESULTS\]\s*/i, '')
      // Strip the "User question:" prefix injected for web-search-augmented prompts
      .replace(/^(?:User question|User query|User's question|User's query):\s*/i, '')
      .trim();

    parsedContent = stripResponsePreamble(parsedContent);

    // Transform broken ASCII scatter plots and axis charts (* -- -- -- + Year 5 Year 10) into clean Markdown tables
    if (
      parsedContent.includes('Accumulated Capital') ||
      /Year\s+\d+\s+Year\s+\d+/i.test(parsedContent) ||
      /(?:\*\s*\||\|\s*\*|\+\-\-\-+)/.test(parsedContent)
    ) {
      parsedContent = parsedContent.replace(
        /(?:Accumulated Capital|\$\d+[\s*|\-+]+|Year\s+\d+[\s\d-]+){3,}/g,
        (match) => {
          // Extract currency values ($1,200,000, $1,000,000, etc) and year markers
          const amounts = match.match(/\$\d{1,3}(?:,\d{3})*/g) || [
            '$0',
            '$200,000',
            '$400,000',
            '$600,000',
            '$800,000',
            '$1,000,000',
          ];
          const years = match.match(/Year\s+\d+/gi) || [
            'Year 5',
            'Year 10',
            'Year 15',
            'Year 20',
            'Year 25',
            'Year 30',
            'Year 35',
            'Year 40',
          ];

          let tableMarkdown =
            '\n\n| Growth Timeline | Estimated Capital ($) | Compounding Milestone |\n| :--- | :--- | :--- |\n';
          const maxLen = Math.max(years.length, 5);
          for (let i = 0; i < maxLen; i++) {
            const y = years[i] || `Period ${i + 1}`;
            const val = amounts[amounts.length - 1 - i] || amounts[i] || '$100,000+';
            const icon =
              i > 4 ? '🔥 Target Achieved' : i > 2 ? '📈 Compounding Phase' : '🌱 Early Growth';
            tableMarkdown += `| **${y}** | \`${val}\` | ${icon} |\n`;
          }
          return tableMarkdown + '\n';
        }
      );

      // Cleanup remaining stray axis artifacts
      parsedContent = parsedContent
        .replace(/--\s*--\s*--\s*--[|-]+/g, '')
        .replace(/\*\s*\|\s*\|\s*\*/g, '')
        .replace(/\n{3,}/g, '\n\n');
    }

    // Clean up any ASCII box art or pipe-wall frames safely without corrupting text or syntax
    if (
      /[┌┐└┘├┤│─▼▲]/.test(parsedContent) ||
      parsedContent.includes('+---') ||
      /\|{2,}/.test(parsedContent)
    ) {
      parsedContent = parsedContent
        .replace(/[┌┐└┘├┤│─▼▲]+/g, '')
        .replace(/\+---+/g, '')
        .replace(/\|{2,}/g, '\n\n')
        .replace(/\|\s*PHASE\s*(\d+)[:\s]*([^|]+)\|/gi, '\n#### 🚀 Phase $1: $2\n')
        .replace(/\|\s*\[\s*\]\s*([^|]+)\|/g, '- [ ] $1\n')
        .replace(/\n{3,}/g, '\n\n');
    }

    // Strip accidental CLI terminal commands telling the user to run slidev locally
    parsedContent = parsedContent
      .replace(
        /(?:(?:you can now )?(?:paste|save) (?:the above|this) (?:markdown|content|code) into a file[\s\S]*?(?:slidev\s+[^\n]+)[\s\S]*?(?:enjoy[!.]?)?)/gi,
        ''
      )
      .replace(/```(?:bash|sh|cmd|powershell)?\s*\n\s*slidev\s+[^\n]+\s*\n```/gi, '')
      .replace(/(?:End of deck[.]?\s*)/gi, '')
      .trim();
  }

  if (!isUser) {
    return extractThinkingAndContent(parsedContent, parsedReasoning);
  }

  return { parsedReasoning, parsedContent };
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

export const MessageBubble = memo<MessageBubbleProps>(
  ({
    msg,
    previousMsg,
    index,
    isLast,
    isStreaming,
    onCopy,
    copiedId,
    submitReward,
    onEdit,
    onRegenerate,
    onBranch,
    onBranchChange,
    activeModel,
    onArtifactClick,
    approveTool,
    rejectTool,
    onPinToggle,
  }) => {
    const isUser = msg.role === 'user';
    const isSetupMessage =
      !isUser &&
      typeof msg.content === 'string' &&
      (msg.content.startsWith('⚙️') ||
        msg.content.includes('Auto-loading Local Model') ||
        msg.content.includes('Local Model Not Loaded'));

    const msgId = `${msg.timestamp}-${index}`;
    const reasoningEnabled =
      isReasoningModel(msg.model || activeModel) ||
      !!msg.reasoning ||
      !!(
        typeof msg.content === 'string' &&
        /<(?:think|thought|thinking|reasoning|antThinking|plan|reflection)(?:\s+[^>]*?)?>/i.test(
          msg.content
        )
      );
    const [lightboxState, setLightboxState] = useState<{
      isOpen: boolean;
      url: string;
      prompt: string;
      engine?: string;
    }>({
      isOpen: false,
      url: '',
      prompt: '',
      engine: '',
    });

    // Hide internal tool feedback messages
    if (
      isUser &&
      typeof msg.content === 'string' &&
      (msg.content.startsWith('[TOOL_RESULT for') ||
        msg.content.startsWith('[TOOL_ERROR for') ||
        msg.content.startsWith('[AVAILABLE TOOLS]'))
    ) {
      return null;
    }

    const { parsedReasoning, parsedContent } = parseMessageContent(msg, isUser, reasoningEnabled);

    const userPromptText = useMemo(() => {
      if (!previousMsg) return '';
      if (typeof previousMsg.content === 'string') return previousMsg.content;
      if (Array.isArray(previousMsg.content)) {
        return (previousMsg.content as any[])
          .map((c) => (typeof c === 'string' ? c : c?.text || ''))
          .join('\n');
      }
      return String(previousMsg.content || '');
    }, [previousMsg]);

    const isThinking =
      isStreaming &&
      !parsedContent &&
      !parsedReasoning &&
      (!msg.toolCalls || msg.toolCalls.length === 0) &&
      (msg.status === 'loading' || msg.status === undefined) &&
      reasoningEnabled;

    const isLoadingIcon =
      (msg.status === 'loading' || msg.status === undefined) && isStreaming && isLast;

    return (
      <motion.div
        initial={isLast && isStreaming ? { opacity: 0, y: 4 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} group`}
      >
        {isUser ? (
          <div className="max-w-[85%] sm:max-w-[75%]">
            <div className="py-3 px-4.5 bg-[#121214] hover:bg-[#161619] border border-white/10 rounded-2xl rounded-tr-xs transition-all shadow-sm text-zinc-100">
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {msg.attachments.map((att, i) => (
                    <FileAttachment
                      key={i}
                      name={att.name}
                      size={att.size}
                      type={att.type}
                      mimeType={att.mimeType}
                    />
                  ))}
                </div>
              )}
              <CollapsibleUserText content={msg.content as string} />
              {msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {msg.images.map((img, i) => (
                    <ImageAttachment
                      key={i}
                      src={
                        img.url ||
                        (img.data
                          ? img.data.startsWith('data:')
                            ? img.data
                            : `data:${img.mimeType || 'image/png'};base64,${img.data}`
                          : '')
                      }
                      alt={img.name}
                    />
                  ))}
                </div>
              )}
            </div>
            <MessageActions
              index={index}
              content={msg.content as string}
              onEdit={onEdit}
              onCopy={onCopy}
              copiedId={copiedId}
              msgId={msgId}
              isUser={true}
              siblingCount={msg.siblingCount}
              currentIndex={msg.currentIndex}
              onBranchChange={onBranchChange}
              isPinned={msg.isPinned}
              onPinToggle={onPinToggle}
            />
          </div>
        ) : (
          <div className="flex flex-col w-full relative">
            <MessageHeader
              msg={msg}
              activeModel={activeModel}
              isStreaming={isStreaming}
              isLast={isLast}
              isSetupMessage={isSetupMessage}
            />

            <div className="flex w-full gap-3 items-start relative">
              <div className="flex-1 min-w-0">
                {isSetupMessage && <FourDotsWaveLoader />}

                {msg.status === 'error' && (
                  <ErrorRenderer
                    content={msg.content as string}
                    onRetry={onRegenerate ? () => onRegenerate(index) : undefined}
                  />
                )}

                {msg.status === 'stopped' && (
                  <p className="text-sm text-muted-foreground py-1 italic flex items-center gap-2">
                    <Square size={10} className="text-muted-foreground" />
                    Generation stopped by user.
                  </p>
                )}

                {(!!parsedReasoning || (reasoningEnabled && isThinking)) && (
                  <div className="pl-0">
                    <ThinkingBlock
                      content={parsedReasoning}
                      isStarting={isThinking && !parsedReasoning}
                      responseContent={parsedContent}
                      thinkingTimeMs={msg.thinkingTimeMs}
                      isComplete={
                        (!isStreaming && msg.status !== 'loading') ||
                        (!!parsedContent && parsedContent.length > 0) ||
                        (!!msg.toolCalls && msg.toolCalls.length > 0)
                      }
                    />
                  </div>
                )}

                {isLoadingIcon &&
                  !isThinking &&
                  !parsedReasoning &&
                  !parsedContent &&
                  (!msg.toolCalls || msg.toolCalls.length === 0) && <FourDotsWaveLoader />}

                {(parsedContent || (msg.toolCalls && msg.toolCalls.length > 0)) && (
                  <div className="pl-0">
                    {msg.toolCalls &&
                      msg.toolCalls.filter(
                        (c) =>
                          c.function?.name &&
                          !(
                            c.function.name === 'write_file' &&
                            (!c.function.arguments || c.function.arguments === '{}')
                          )
                      ).length > 0 && (
                        <div className="space-y-1">
                          <ToolCallRenderer
                            toolCalls={msg.toolCalls.filter(
                              (c) =>
                                c.function?.name &&
                                !(
                                  c.function.name === 'write_file' &&
                                  (!c.function.arguments || c.function.arguments === '{}')
                                )
                            )}
                            isStreaming={isStreaming}
                            isLast={isLast}
                          />
                        </div>
                      )}

                    {parsedContent && msg.status !== 'error' && !isSetupMessage && (
                      <MarkdownContent
                        content={parsedContent}
                        blocks={(msg as any).blocks}
                        isStreaming={isStreaming && isLast}
                        citations={msg.citations}
                        images={msg.images}
                        videos={(msg as any).videos}
                        audios={(msg as any).audios}
                        onOpenLightbox={(url?: string, prompt?: string, engine?: string) => {
                          setLightboxState({
                            isOpen: true,
                            url: url || '',
                            prompt: prompt || '',
                            engine: engine || 'NYX Engine',
                          });
                        }}
                        onArtifactClick={onArtifactClick as any}
                      />
                    )}

                    <ImageLightbox
                      isOpen={lightboxState.isOpen}
                      imageUrl={lightboxState.url}
                      prompt={lightboxState.prompt}
                      engine={lightboxState.engine}
                      onClose={() => setLightboxState((prev) => ({ ...prev, isOpen: false }))}
                    />

                    {msg.citations && msg.citations.length > 0 && (
                      // SourcesToggle is imported from parent — kept in ChatMessageList to avoid circular dep
                      <SourcesTogglePlaceholder citations={msg.citations} />
                    )}

                    {msg.pendingApproval && (
                      <ToolApprovalGate
                        msg={msg}
                        index={index}
                        approveTool={approveTool}
                        rejectTool={rejectTool}
                      />
                    )}

                    {!isStreaming && !isSetupMessage && (
                      <>
                        <MessageActions
                          index={index}
                          content={parsedContent || ''}
                          onCopy={onCopy}
                          copiedId={copiedId}
                          msgId={msgId}
                          isUser={false}
                          onRegenerate={onRegenerate}
                          onBranch={onBranch}
                          activeModel={activeModel}
                          siblingCount={msg.siblingCount}
                          currentIndex={msg.currentIndex}
                          isPinned={msg.isPinned}
                          onPinToggle={onPinToggle}
                        />
                        <FeedbackButtons msg={msg} submitReward={submitReward} />
                      </>
                    )}
                  </div>
                )}

                {!parsedContent &&
                  !parsedReasoning &&
                  (!msg.toolCalls || msg.toolCalls.length === 0) &&
                  msg.status !== 'loading' &&
                  msg.status !== 'error' && (
                    <div className="text-muted-foreground text-xs italic py-1">
                      Empty response from model.
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    );
  },
  (prevProps, nextProps) => {
    // If streaming state changed on this message, re-render
    if (prevProps.isStreaming !== nextProps.isStreaming) return false;
    if (prevProps.isLast !== nextProps.isLast) return false;
    if (nextProps.isLast && (nextProps.isStreaming || nextProps.msg.status === 'loading'))
      return false;

    // Check message content and state changes
    if (prevProps.msg.content !== nextProps.msg.content) return false;
    if (prevProps.msg.reasoning !== nextProps.msg.reasoning) return false;
    if (prevProps.msg.status !== nextProps.msg.status) return false;
    if (prevProps.msg.toolCalls?.length !== nextProps.msg.toolCalls?.length) return false;
    if (prevProps.msg.attachments?.length !== nextProps.msg.attachments?.length) return false;
    if (prevProps.msg.images?.length !== nextProps.msg.images?.length) return false;
    if ((prevProps.msg as any).videos?.length !== (nextProps.msg as any).videos?.length)
      return false;
    if (prevProps.msg.citations?.length !== nextProps.msg.citations?.length) return false;
    if (prevProps.msg.pendingApproval !== nextProps.msg.pendingApproval) return false;
    if (prevProps.msg.isPinned !== nextProps.msg.isPinned) return false;
    if (prevProps.activeModel !== nextProps.activeModel) return false;

    // Only re-render if copiedId changes specifically for this message
    const thisMsgId = `${nextProps.msg.timestamp}-${nextProps.index}`;
    if (
      prevProps.copiedId !== nextProps.copiedId &&
      (prevProps.copiedId === thisMsgId || nextProps.copiedId === thisMsgId)
    ) {
      return false;
    }

    // Previous completed messages remain completely static
    return true;
  }
);
MessageBubble.displayName = 'MessageBubble';

// ---------------------------------------------------------------------------
// Internal sub-components (keep colocated — no circular dep risk)
// ---------------------------------------------------------------------------

/**
 * Thin wrapper so MessageBubble/index.tsx doesn't import SourcesToggle directly
 * (which lives in ChatMessageList to avoid a circular dep chain). The parent
 * ChatMessageList will pass SourcesToggle as a prop in a future cleanup; for now,
 * this delegates to the re-exported version via dynamic import.
 */
const SourcesTogglePlaceholder: React.FC<{ citations: any[] }> = ({ citations }) => {
  if (!citations || citations.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/40">
      {citations.slice(0, 8).map((cite, i) => (
        <a
          key={cite.id ?? i}
          href={cite.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50 transition-colors"
        >
          <span className="text-primary font-bold">[{i + 1}]</span>
          <span className="truncate max-w-[140px]">{cite.title || cite.source || cite.url}</span>
        </a>
      ))}
    </div>
  );
};

const ToolApprovalGate: React.FC<{
  msg: ChatMessage;
  index: number;
  approveTool?: (index: number, approvalId: string) => void;
  rejectTool?: (index: number, approvalId: string) => void;
}> = ({ msg, index, approveTool, rejectTool }) => {
  const approval = msg.pendingApproval as any;
  if (!approval) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="my-4 p-5 rounded-xl border border-border bg-card relative overflow-hidden"
    >
      <div className="flex items-start gap-3.5 relative z-10">
        <div className="p-2 rounded-lg bg-muted text-foreground border border-border shrink-0">
          <Shield size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2">
              <span>Agent Tool Authorization</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono font-bold uppercase tracking-wider border border-border">
                Action Gate
              </span>
            </h4>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Agent requests permission to execute the following tool operation:
          </p>

          <div className="mt-3.5 bg-background border border-border rounded-lg p-3 font-mono">
            <div className="text-[11px] text-foreground font-bold mb-2 flex items-center gap-2">
              <Zap size={12} className="text-primary" />
              <span>{approval.tool}</span>
            </div>
            <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap bg-muted/40 p-2.5 rounded border border-border/40 max-h-[200px] overflow-y-auto">
              {JSON.stringify(approval.input || {}, null, 2)}
            </pre>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => {
                rejectTool?.(index, approval.approvalId);
                toast.error('Action Rejected', {
                  description: 'Tool execution cancelled.',
                });
              }}
              className="px-4 py-2 rounded-lg border border-destructive/20 text-destructive bg-destructive/10 hover:bg-destructive/20 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
            >
              <X size={14} />
              Reject Action
            </button>
            <button
              onClick={() => {
                approveTool?.(index, approval.approvalId);
                toast.success('Action Approved', { description: 'Executing tool...' });
              }}
              className="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold cursor-pointer transition-colors flex items-center gap-2"
            >
              <Check size={14} />
              Approve &amp; Execute
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
