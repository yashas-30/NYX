import React, { memo } from 'react';
import { TerminalIcon as Terminal } from '@animateicons/react/lucide';
import { FileText } from 'lucide-react';
import { NyxLoader } from '@src/assets/icons/icons';

export interface StreamingArtifact {
  id: string;
  type: 'code' | 'html' | 'react' | 'markdown' | string;
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

          return (
            <div
              key={artifact.id || i}
              onClick={() => onArtifactClick?.(artifact)}
              className="cursor-pointer group flex items-center justify-between p-3.5 my-3 rounded-xl border border-border/60 bg-surface hover:bg-muted/30 hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 text-primary">
                  {artifact.type === 'html' || artifact.type === 'react' || artifact.type === 'code' ? (
                    <Terminal className="w-4.5 h-4.5" />
                  ) : (
                    <FileText className="w-4.5 h-4.5" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {artifact.title || 'Generated Artifact'}
                  </span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    {artifact.type === 'code' ? artifact.language || 'code' : artifact.type}
                  </span>
                </div>
              </div>
              <div className="text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                Click to open
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);
ArtifactRenderer.displayName = 'ArtifactRenderer';
