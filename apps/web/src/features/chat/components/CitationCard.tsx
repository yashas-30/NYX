/**
 * @file CitationCard.tsx
 * @description Hover-expandable citation card with source preview — Kimi/Perplexity parity.
 */
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLinkIcon as ExternalLink, GlobeIcon as Globe } from '@animateicons/react/lucide';

export interface Citation {
  id: string;
  index: number;
  title: string;
  url: string;
  snippet: string;
  domain?: string;
}

interface CitationCardProps {
  citation: Citation;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export const CitationCard: React.FC<CitationCardProps> = ({ citation }) => {
  const [isHovered, setIsHovered] = useState(false);
  const domain = citation.domain || getDomain(citation.url);

  return (
    <span className="relative inline-block">
      <button
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold rounded-full bg-primary/20 text-primary border border-primary/30 hover:bg-primary/40 hover:text-primary transition-colors cursor-pointer align-middle mx-0.5"
        style={{ verticalAlign: 'super', fontSize: '9px', lineHeight: 1 }}
      >
        {citation.index}
      </button>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-72 bg-popover border border-border rounded-xl shadow-md p-3"
          >
            {/* Source header */}
            <div className="flex items-start gap-2 mb-2">
              <div className="p-1 bg-muted rounded shrink-0">
                <Globe className="w-3 h-3 text-muted-foreground/60" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-foreground leading-tight line-clamp-2">
                  {citation.title || domain}
                </p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">{domain}</p>
              </div>
            </div>

            {/* Snippet */}
            {citation.snippet && (
              <p className="text-[11px] text-muted-foreground/80 leading-relaxed line-clamp-3 border-t border-border pt-2 mt-2">
                {citation.snippet}
              </p>
            )}

            {/* Open link */}
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 mt-2 text-[10px] text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              Open source
            </a>

            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-border" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
};

// Inline citation superscript renderer — call this in ChatMessageList
export const CitationSuperscript: React.FC<{ index: number; citations: Citation[] }> = ({
  index,
  citations,
}) => {
  const citation = citations.find((c) => c.index === index);
  if (!citation) return <sup>[{index}]</sup>;
  return <CitationCard citation={citation} />;
};

export interface SourcesFooterProps {
  citations: Citation[];
}

export const SourcesFooter: React.FC<SourcesFooterProps> = ({ citations }) => {
  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-6 pt-4 border-t border-border/60 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-indigo-400" />
          Verified Sources ({citations.length})
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {citations.map((c) => {
          const domain = c.domain || getDomain(c.url);
          const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
          return (
            <a
              key={c.id || c.index}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/50 bg-card/40 hover:bg-card hover:border-indigo-500/40 transition-all group/source text-left"
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-muted shrink-0 overflow-hidden border border-border/40">
                <img
                  src={faviconUrl}
                  alt={domain}
                  className="w-4 h-4 object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate group-hover/source:text-indigo-400 transition-colors">
                  {c.title || domain}
                </p>
                <p className="text-[10px] text-muted-foreground/60 truncate">{domain}</p>
              </div>
              <ExternalLink className="w-3 h-3 text-muted-foreground/40 group-hover/source:text-indigo-400 shrink-0" />
            </a>
          );
        })}
      </div>
    </div>
  );
};
