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
        className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/40 hover:text-indigo-300 transition-colors cursor-pointer align-middle mx-0.5"
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
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-72 bg-[#141618] border border-white/10 rounded-xl shadow-2xl p-3"
          >
            {/* Source header */}
            <div className="flex items-start gap-2 mb-2">
              <div className="p-1 bg-white/5 rounded shrink-0">
                <Globe className="w-3 h-3 text-white/40" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-white/90 leading-tight line-clamp-2">
                  {citation.title || domain}
                </p>
                <p className="text-[10px] text-white/30 mt-0.5">{domain}</p>
              </div>
            </div>

            {/* Snippet */}
            {citation.snippet && (
              <p className="text-[11px] text-white/50 leading-relaxed line-clamp-3 border-t border-white/5 pt-2 mt-2">
                {citation.snippet}
              </p>
            )}

            {/* Open link */}
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 mt-2 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              Open source
            </a>

            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white/10" />
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
