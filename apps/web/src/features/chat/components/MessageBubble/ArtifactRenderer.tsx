import React, { memo } from 'react';
import { NyxLoader } from '@src/assets/icons/icons';
import { SvgDiagramCard } from '../SvgDiagramCard';

export interface VisualAttachment {
  id: string;
  type: 'diagram' | string;
  title: string;
  content: string;
  language?: string;
}

interface VisualAttachmentRendererProps {
  /** Completed visuals from msg.artifacts */
  artifacts: VisualAttachment[];
  /** In-flight placeholders detected during streaming */
  streamingArtifacts: VisualAttachment[];
  onVisualClick?: (visual: { type: 'diagram'; title: string; content: string }) => void;
}

/**
 * Renders editorial Diagram-Design visuals strictly via SvgDiagramCard.
 */
export const ArtifactRenderer: React.FC<VisualAttachmentRendererProps> = memo(
  ({ artifacts, streamingArtifacts }) => {
    // Only display Diagram Design visuals
    const validVisuals = [...artifacts, ...streamingArtifacts].filter((art) => {
      if (art.id === 'streaming-artifact') return true;
      const isDiagram =
        art.type === 'diagram' ||
        art.language === 'diagram' ||
        art.language === 'diagram-design' ||
        (typeof art.content === 'string' &&
          (/<svg\b/i.test(art.content) || /class="[^"]*diagram/i.test(art.content)));
      return isDiagram;
    });

    if (validVisuals.length === 0) return null;

    return (
      <div className="space-y-2 mt-3">
        {validVisuals.map((visual, i) => {
          if (visual.id === 'streaming-artifact') {
            return (
              <div
                key={`streaming-${i}`}
                className="rounded-xl border border-white/10 bg-[#09090b] overflow-hidden flex flex-col my-3 p-4 shadow-sm w-full cursor-default"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <NyxLoader size={16} className="text-zinc-300 animate-pulse" />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div className="h-4 bg-zinc-800 animate-pulse rounded w-1/3" />
                    <div className="h-3 bg-zinc-800 animate-pulse rounded w-1/4" />
                  </div>
                  <div className="text-xs text-zinc-400 font-semibold animate-pulse uppercase tracking-wider">
                    Rendering Visual...
                  </div>
                </div>
              </div>
            );
          }

          if (!visual.content?.trim()) return null;
          return <SvgDiagramCard key={visual.id || i} svgCode={visual.content} />;
        })}
      </div>
    );
  }
);
ArtifactRenderer.displayName = 'ArtifactRenderer';
