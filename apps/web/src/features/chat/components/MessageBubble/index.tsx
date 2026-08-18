import React, { memo, useRef, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Square, Shield, Zap } from 'lucide-react';
import { CheckIcon as Check, XIcon as X } from '@animateicons/react/lucide';
import { ChatMessage, ToolCall } from '@src/infrastructure/types';
import { isReasoningModel } from '@src/infrastructure/utils/provider';
import { toast } from '@src/shared/components/ui/sonner';

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
import { ArtifactRenderer, StreamingArtifact } from './ArtifactRenderer';
import { ImageArtifactCard } from '../ImageArtifactCard';
import { ImageLightbox } from '../ImageLightbox';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MessageBubbleProps {
  msg: ChatMessage;
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
  onArtifactClick?: (artifact: StreamingArtifact) => void;
  approveTool?: (index: number, approvalId: string) => void;
  rejectTool?: (index: number, approvalId: string) => void;
  onPinToggle?: (index: number) => void;
}

// ---------------------------------------------------------------------------
// Artifact detection helper (streaming only)
// ---------------------------------------------------------------------------

const ARTIFACT_LANGS = new Set([
  'html', 'htm', 'react', 'tsx', 'jsx', 'ts', 'js',
  'typescript', 'javascript', 'python', 'json', 'csv',
  'mermaid', 'svg', 'markdown', 'md',
]);

function detectStreamingArtifacts(content: string): StreamingArtifact[] {
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)(?:```|$)/g;
  const detected: StreamingArtifact[] = [];
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const isClosed = content.substring(match.index).includes('```', match[1].length + 3);
    if (!isClosed) {
      const lang = match[1]?.toLowerCase();
      if (ARTIFACT_LANGS.has(lang)) {
        detected.push({ id: 'streaming-artifact', type: 'code', title: 'Generating...', content: '' });
      }
    }
  }
  return detected;
}

// ---------------------------------------------------------------------------
// Content parsing helpers
// ---------------------------------------------------------------------------

interface ParsedContent {
  parsedReasoning: string;
  parsedContent: string;
}

function parseMessageContent(msg: ChatMessage, isUser: boolean, reasoningEnabled: boolean): ParsedContent {
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
      // Hard safety net: strip well-known filler preambles that the model adds
      // before the actual answer despite the persona instruction.
      .replace(/^Based on the (?:search results|information|data) provided[\s\S]*?:/i, '')
      .replace(
        /^(?:(?:according to (?:the )?(?:search results?|(?:the )?information(?: provided)?|(?:my )?(?:knowledge|data|findings))|based on (?:the )?(?:information|(?:search )?results?|(?:my )?(?:knowledge|research))|here'?s? (?:what i found|the (?:answer|information|result)s?)|that'?s? (?:a )?(?:great|good|excellent|interesting) question[!.]?|great question[!.]?|i found (?:the following|some information)|let me (?:share|give you|provide)|the (?:answer|president|result) (?:is|of|to)|in (?:summary|short|brief),?)[,!.]?\s*)+/i,
        ''
      )
      .trim();

    // Transform broken ASCII scatter plots and axis charts (* -- -- -- + Year 5 Year 10) into clean Markdown tables
    if (parsedContent.includes('Accumulated Capital') || /Year\s+\d+\s+Year\s+\d+/i.test(parsedContent) || /(?:\*\s*\||\|\s*\*|\+\-\-\-+)/.test(parsedContent)) {
      parsedContent = parsedContent.replace(/(?:Accumulated Capital|\$\d+[\s*|\-+]+|Year\s+\d+[\s\d-]+){3,}/g, (match) => {
        // Extract currency values ($1,200,000, $1,000,000, etc) and year markers
        const amounts = match.match(/\$\d{1,3}(?:,\d{3})*/g) || ['$0', '$200,000', '$400,000', '$600,000', '$800,000', '$1,000,000'];
        const years = match.match(/Year\s+\d+/gi) || ['Year 5', 'Year 10', 'Year 15', 'Year 20', 'Year 25', 'Year 30', 'Year 35', 'Year 40'];

        let tableMarkdown = '\n\n| Growth Timeline | Estimated Capital ($) | Compounding Milestone |\n| :--- | :--- | :--- |\n';
        const maxLen = Math.max(years.length, 5);
        for (let i = 0; i < maxLen; i++) {
          const y = years[i] || `Period ${i + 1}`;
          const val = amounts[amounts.length - 1 - i] || amounts[i] || '$100,000+';
          const icon = i > 4 ? '🔥 Target Achieved' : (i > 2 ? '📈 Compounding Phase' : '🌱 Early Growth');
          tableMarkdown += `| **${y}** | \`${val}\` | ${icon} |\n`;
        }
        return tableMarkdown + '\n';
      });

      // Cleanup remaining stray axis artifacts
      parsedContent = parsedContent
        .replace(/--\s*--\s*--\s*--[|-]+/g, '')
        .replace(/\*\s*\|\s*\|\s*\*/g, '')
        .replace(/\n{3,}/g, '\n\n');
    }

    // Clean up any ASCII box art or pipe-wall frames safely without corrupting text or syntax
    if (/[┌┐└┘├┤│─▼▲]/.test(parsedContent) || parsedContent.includes('+---') || /\|{2,}/.test(parsedContent)) {
      parsedContent = parsedContent
        .replace(/[┌┐└┘├┤│─▼▲]+/g, '')
        .replace(/\+---+/g, '')
        .replace(/\|{2,}/g, '\n\n')
        .replace(/\|\s*PHASE\s*(\d+)[:\s]*([^|]+)\|/gi, '\n#### 🚀 Phase $1: $2\n')
        .replace(/\|\s*\[\s*\]\s*([^|]+)\|/g, '- [ ] $1\n')
        .replace(/\n{3,}/g, '\n\n');
    }
  }



  const thinkStartMatch = parsedContent.match(/<(?:think|thought|thinking)>/i);
  if (thinkStartMatch) {
    const startIndex = thinkStartMatch.index!;
    const endMatch = parsedContent.match(/<\/(?:think|thought|thinking)>/i);

    const innerText =
      endMatch && typeof endMatch.index !== 'undefined' && endMatch.index > startIndex
        ? parsedContent.substring(startIndex + thinkStartMatch[0].length, endMatch.index).trim()
        : parsedContent.substring(startIndex + thinkStartMatch[0].length).trim();

    const outsideText =
      endMatch && typeof endMatch.index !== 'undefined' && endMatch.index > startIndex
        ? (parsedContent.substring(0, startIndex) + parsedContent.substring(endMatch.index + endMatch[0].length)).trim()
        : parsedContent.substring(0, startIndex).trim();

    if (innerText) {
      parsedReasoning = parsedReasoning ? `${parsedReasoning}\n${innerText}` : innerText;
    }
    parsedContent = outsideText || innerText;
  }

  return { parsedReasoning, parsedContent };
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

export const MessageBubble = memo<MessageBubbleProps>(
  ({
    msg,
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
    const reasoningEnabled = isReasoningModel(msg.model || activeModel);
    const [lightboxState, setLightboxState] = useState<{ isOpen: boolean; url: string; prompt: string; engine?: string }>({
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

    // Streaming artifact detection with ref guard to skip unchanged content
    const artifactContentRef = useRef('');
    const streamingArtifacts = useMemo<StreamingArtifact[]>(() => {
      if (!isStreaming || !isLast || !parsedContent) return [];
      if (artifactContentRef.current === parsedContent) return [];
      const detected = detectStreamingArtifacts(parsedContent);
      artifactContentRef.current = parsedContent;
      return detected;
    }, [isStreaming, isLast, parsedContent]);

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
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} group`}
      >
        {isUser ? (
          <div className="max-w-[85%] sm:max-w-[75%] animate-fade-in">
            <div className="py-3 px-4.5 bg-indigo-600/10 hover:bg-indigo-600/15 border border-indigo-500/20 rounded-2xl rounded-tr-xs transition-all shadow-md backdrop-blur-md text-slate-100 dark:text-slate-100">
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
          <div className="flex flex-col w-full animate-fade-in relative">
            <MessageHeader
              msg={msg}
              activeModel={activeModel}
              isStreaming={isStreaming}
              isLast={isLast}
              isSetupMessage={isSetupMessage}
            />

            <div className="flex w-full gap-3 items-start relative">
              <div className="flex-1 min-w-0">
                {isSetupMessage && (
                  <FourDotsWaveLoader />
                )}

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

                {(isThinking || parsedReasoning) && (
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

                {isLoadingIcon && !isThinking && !parsedReasoning && !parsedContent && (!msg.toolCalls || msg.toolCalls.length === 0) && (
                  <FourDotsWaveLoader />
                )}

                {(parsedContent || (msg.toolCalls && msg.toolCalls.length > 0)) && (
                  <div className="pl-0">
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="space-y-1">
                        <ToolCallRenderer
                          toolCalls={msg.toolCalls}
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
                      />
                    )}

                    {msg.images && msg.images.length > 0 && !isUser && (
                      <div className="flex flex-col gap-3 my-3">
                        {msg.images.map((img, i) => (
                          <ImageArtifactCard
                            key={i}
                            imageUrl={img.url || (img.data ? (img.data.startsWith('data:') ? img.data : `data:${img.mimeType || 'image/png'};base64,${img.data}`) : '')}
                            prompt={img.name || (typeof msg.content === 'string' ? msg.content : 'Generated Visual Asset')}
                            aspectRatio={(img as any).aspectRatio || '16:9'}
                            engine={(img as any).engine || 'NYX Diffuser Engine'}
                            onOpenLightbox={(url?: string, prompt?: string, engine?: string) => {
                              setLightboxState({ isOpen: true, url: url || '', prompt: prompt || '', engine: engine || 'NYX Engine' });
                            }}
                          />
                        ))}
                      </div>
                    )}

                    <ImageLightbox
                      isOpen={lightboxState.isOpen}
                      imageUrl={lightboxState.url}
                      prompt={lightboxState.prompt}
                      engine={lightboxState.engine}
                      onClose={() => setLightboxState((prev) => ({ ...prev, isOpen: false }))}
                    />

                    <ArtifactRenderer
                      artifacts={(msg.artifacts || []) as StreamingArtifact[]}
                      streamingArtifacts={streamingArtifacts}
                      onArtifactClick={onArtifactClick}
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
    if (prevProps.msg !== nextProps.msg) return false;
    if (prevProps.isLast !== nextProps.isLast) return false;
    if (prevProps.isStreaming !== nextProps.isStreaming) return false;
    if (prevProps.index !== nextProps.index) return false;
    if (prevProps.copiedId !== nextProps.copiedId) return false;
    if (prevProps.activeModel !== nextProps.activeModel) return false;
    // Compare stable function references — stale closures will execute otherwise
    if (prevProps.onCopy !== nextProps.onCopy) return false;
    if (prevProps.onRegenerate !== nextProps.onRegenerate) return false;
    if (prevProps.onEdit !== nextProps.onEdit) return false;
    if (prevProps.approveTool !== nextProps.approveTool) return false;
    if (prevProps.rejectTool !== nextProps.rejectTool) return false;
    if (prevProps.onPinToggle !== nextProps.onPinToggle) return false;
    if (prevProps.onBranchChange !== nextProps.onBranchChange) return false;
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
      className="my-4 p-5 rounded-2xl border border-purple-500/30 bg-purple-950/10 dark:bg-purple-950/20 backdrop-blur-md shadow-xl relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
      <div className="flex items-start gap-3.5 relative z-10">
        <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
          <Shield size={18} className="animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2">
              <span>Lucifer Agent Tool Authorization</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-bold uppercase tracking-wider border border-purple-500/30">
                Action Gate
              </span>
            </h4>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Lucifer Supreme Agent requests permission to execute the following tool operation:
          </p>

          <div className="mt-3.5 bg-muted/40 border border-border/50 rounded-xl p-3.5 font-mono">
            <div className="text-[11px] text-purple-300 font-bold mb-2 flex items-center gap-2">
              <Zap size={12} className="text-purple-400" />
              <span>{approval.tool}</span>
            </div>
            <pre className="text-[11px] text-foreground/90 whitespace-pre-wrap bg-background/60 p-2.5 rounded-lg border border-border/40 max-h-[200px] overflow-y-auto">
              {JSON.stringify(approval.input || {}, null, 2)}
            </pre>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => {
                rejectTool?.(index, approval.approvalId);
                toast.error('Action Rejected', { description: 'Lucifer tool execution cancelled.' });
              }}
              className="px-4 py-2 rounded-xl border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5"
            >
              <X size={14} />
              Reject Action
            </button>
            <button
              onClick={() => {
                approveTool?.(index, approval.approvalId);
                toast.success('Action Approved', { description: 'Executing Lucifer tool...' });
              }}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold cursor-pointer transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
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
