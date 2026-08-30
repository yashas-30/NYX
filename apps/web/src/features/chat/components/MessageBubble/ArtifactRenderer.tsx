import React, { memo } from 'react';
import { TerminalIcon as Terminal } from '@animateicons/react/lucide';
import { FileText, Presentation, Workflow } from 'lucide-react';
import { NyxLoader } from '@src/assets/icons/icons';

export interface StreamingArtifact {
  id: string;
  type: 'code' | 'html' | 'react' | 'markdown' | 'slidev' | 'presentation' | string;
  title: string;
  content: string;
  language?: string;
}

interface ArtifactRendererProps {
  /** Completed artifacts from msg.artifacts */
  artifacts: StreamingArtifact[];
  /** In-flight artifact placeholders detected during streaming */
  streamingArtifacts: StreamingArtifact[];
  onArtifactClick?: (artifact: StreamingArtifact) => void;
}

/**
 * Renders the artifact section of an assistant message.
 * Shows a shimmer placeholder card while an artifact is still streaming,
 * and a clickable card for each completed artifact.
 * Extracted from the IIFE at ~L1342 in ChatMessageList.
 */
export const ArtifactRenderer: React.FC<ArtifactRendererProps> = memo(
  ({ artifacts, streamingArtifacts, onArtifactClick }) => {
    const allArtifacts = [...artifacts, ...streamingArtifacts];
    if (allArtifacts.length === 0) return null;

    return (
      <div className="space-y-1 mt-2">
        {allArtifacts.map((artifact, i) => {
          if (artifact.id === 'streaming-artifact') {
            return (
              <div
                key={`streaming-${i}`}
                className="rounded-md border border-border bg-surface overflow-hidden flex flex-col my-4 shadow-sm w-full p-4 cursor-default"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <NyxLoader size={16} className="text-primary/70 animate-pulse" />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div className="h-4 bg-muted/60 animate-pulse rounded w-1/3" />
                    <div className="h-3 bg-muted/60 animate-pulse rounded w-1/4" />
                  </div>
                  <div className="text-xs text-primary/70 font-semibold animate-pulse uppercase tracking-wider">
                    Generating Artifact...
                  </div>
                </div>
              </div>
            );
          }

          const isPresentation =
            artifact.type === 'slidev' ||
            artifact.type === 'presentation' ||
            artifact.type === 'slides' ||
            artifact.language === 'slidev' ||
            artifact.language === 'slides';

          const hasSvgOrHtml =
            typeof artifact.content === 'string' &&
            (/<svg\b/i.test(artifact.content) || /<div\b/i.test(artifact.content));

          const isDiagram =
            artifact.type === 'diagram' ||
            artifact.language === 'mermaid' ||
            artifact.language === 'diagram' ||
            artifact.language === 'diagram-design' ||
            hasSvgOrHtml ||
            (typeof artifact.content === 'string' &&
              /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|C4Context|C4Container)\b/im.test(
                artifact.content
              ));

          return (
            <div
              key={artifact.id || i}
              className="my-3 rounded-xl border border-white/10 bg-[#09090b] shadow-md overflow-hidden transition-all"
            >
              {/* Header Bar */}
              <div
                onClick={() => onArtifactClick?.(artifact)}
                className="cursor-pointer group flex items-center justify-between p-3 bg-[#121214] hover:bg-[#161619] border-b border-white/10 transition-colors"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-900 border border-white/10 text-zinc-300 group-hover:text-indigo-400 group-hover:border-indigo-500/30 transition-colors">
                    {isPresentation ? (
                      <Presentation className="w-4 h-4 text-zinc-200" />
                    ) : isDiagram ? (
                      <Workflow className="w-4 h-4 text-zinc-200" />
                    ) : artifact.type === 'html' ||
                      artifact.type === 'react' ||
                      artifact.type === 'code' ? (
                      <Terminal className="w-4 h-4 text-zinc-200" />
                    ) : (
                      <FileText className="w-4 h-4 text-zinc-200" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-zinc-100 truncate group-hover:text-white transition-colors">
                      {artifact.title ||
                        (isPresentation
                          ? 'Slidev Presentation Deck'
                          : isDiagram
                            ? 'Architecture Diagram'
                            : 'Generated Artifact')}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                      {isPresentation
                        ? 'Slidev Presentation'
                        : isDiagram
                          ? hasSvgOrHtml
                            ? 'Editorial Diagram Design'
                            : 'Mermaid Diagram'
                          : artifact.type === 'code'
                            ? artifact.language || 'code'
                            : artifact.type}
                    </span>
                  </div>
                </div>
                <div className="text-xs font-medium text-indigo-400 group-hover:text-indigo-300 transition-colors pr-1 flex items-center gap-1">
                  {isPresentation
                    ? 'Launch Deck →'
                    : isDiagram
                      ? 'Open in Canvas (Pan & Zoom) →'
                      : 'Open in Canvas →'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);
ArtifactRenderer.displayName = 'ArtifactRenderer';
