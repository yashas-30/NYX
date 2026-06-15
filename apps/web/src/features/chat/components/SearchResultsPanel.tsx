/**
 * @file SearchResultsPanel.tsx
 * @description Sources panel rendered at the bottom of assistant messages that used web search.
 */
import React, { useState } from 'react';
import { Globe, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Citation } from './CitationCard';

interface SearchResultsPanelProps {
  citations: Citation[];
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export const SearchResultsPanel: React.FC<SearchResultsPanelProps> = ({ citations }) => {
  const [expanded, setExpanded] = useState(false);

  if (!citations || citations.length === 0) return null;

  const shown = expanded ? citations : citations.slice(0, 3);

  return (
    <div className="mt-3 border-t border-white/5 pt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/60 transition-colors mb-2"
      >
        <Globe className="w-3 h-3" />
        <span>
          {citations.length} source{citations.length !== 1 ? 's' : ''}
        </span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      <AnimatePresence>
        <motion.div initial={false} className="grid grid-cols-1 gap-1">
          {shown.map((cit, i) => (
            <motion.a
              key={cit.id}
              href={cit.url}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] hover:border-white/[0.08] transition-colors group"
            >
              <span className="text-[9px] w-4 h-4 flex items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400 font-bold shrink-0">
                {cit.index}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white/70 truncate">{cit.title || getDomain(cit.url)}</p>
                <p className="text-[10px] text-white/25">{getDomain(cit.url)}</p>
              </div>
              <ExternalLink className="w-3 h-3 text-white/0 group-hover:text-white/30 transition-colors shrink-0" />
            </motion.a>
          ))}
        </motion.div>
      </AnimatePresence>

      {citations.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[10px] text-white/25 hover:text-white/50 transition-colors"
        >
          {expanded ? 'Show less' : `+${citations.length - 3} more sources`}
        </button>
      )}
    </div>
  );
};
