/**
 * @file SearchResultsPanel.tsx
 * @description Compact, expandable source panel rendered at the bottom of assistant messages.
 * Default state: Compact bar with count, side-by-side domain favicon icons, and an arrow button.
 * Expanded state: Retractable grid of source cards with title, domain, snippet preview, and direct links.
 */
import React, { useState } from 'react';
import { Globe, ExternalLink, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Citation } from './CitationCard';

interface SearchResultsPanelProps {
  citations: Citation[];
  searchProvider?: string;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return '';
  }
}

const FaviconIcon: React.FC<{ url: string; domain: string }> = ({ url, domain }) => {
  const [error, setError] = useState(false);
  const faviconUrl = getFaviconUrl(url);

  return (
    <span
      className="w-5 h-5 rounded-full bg-background border border-border/80 flex items-center justify-center overflow-hidden shrink-0 shadow-xs"
      title={domain}
    >
      {!error && faviconUrl ? (
        <img
          src={faviconUrl}
          alt={domain}
          className="w-3.5 h-3.5 object-contain rounded-full"
          onError={() => setError(true)}
        />
      ) : (
        <Globe className="w-2.5 h-2.5 text-muted-foreground/60" />
      )}
    </span>
  );
};

const SourceTile: React.FC<{ citation: Citation; index: number }> = ({ citation, index }) => {
  const [faviconError, setFaviconError] = useState(false);
  const domain = citation.domain || getDomain(citation.url);
  const faviconUrl = getFaviconUrl(citation.url);

  return (
    <motion.a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.18 }}
      className="flex flex-col gap-1.5 p-3 rounded-xl bg-muted/30 hover:bg-muted/60 border border-border/50 hover:border-border/90 transition-all group cursor-pointer"
    >
      {/* Header: favicon + domain + external icon */}
      <div className="flex items-center gap-1.5">
        <span className="w-4 h-4 rounded flex items-center justify-center shrink-0 overflow-hidden">
          {!faviconError && faviconUrl ? (
            <img
              src={faviconUrl}
              alt={domain}
              className="w-4 h-4 object-contain"
              onError={() => setFaviconError(true)}
            />
          ) : (
            <Globe className="w-3 h-3 text-muted-foreground/60" />
          )}
        </span>
        <span className="text-[10px] font-medium text-muted-foreground/70 truncate flex-1">{domain}</span>
        <ExternalLink className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
      </div>

      {/* Title */}
      <p className="text-[11px] font-semibold text-foreground/90 line-clamp-2 leading-snug">
        {citation.title || domain}
      </p>

      {/* Snippet */}
      {citation.snippet && (
        <p className="text-[10px] text-muted-foreground/60 line-clamp-2 leading-relaxed">
          {citation.snippet}
        </p>
      )}

      {/* Citation index badge */}
      <div className="mt-auto pt-1 flex items-center justify-between">
        <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-primary/10 text-primary border border-primary/20">
          #{citation.index}
        </span>
      </div>
    </motion.a>
  );
};

export const SearchResultsPanel: React.FC<SearchResultsPanelProps> = ({ citations, searchProvider }) => {
  const [expanded, setExpanded] = useState(false);

  if (!citations || citations.length === 0) return null;

  // Extract unique domains & favicons for compact collapsed icon row (max 8 favicons)
  const uniqueCitations = citations.filter(
    (c, index, self) => index === self.findIndex((t) => getDomain(t.url) === getDomain(c.url))
  );
  const iconList = uniqueCitations.slice(0, 8);
  const providerLabel = searchProvider === 'tavily' ? 'Tavily' : 'DuckDuckGo';

  return (
    <div className="mt-3 border-t border-border/40 pt-2.5">
      {/* Compact Header Bar — clickable to expand/retract */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-2 rounded-xl bg-muted/20 hover:bg-muted/40 border border-border/40 transition-all group cursor-pointer"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <Globe className="w-3.5 h-3.5 text-primary/70 shrink-0" />
          <span className="text-xs font-semibold text-foreground/90">
            {citations.length} Source{citations.length !== 1 ? 's' : ''}
          </span>

          {/* Compact side-by-side back-to-back favicon icons */}
          <div className="flex items-center -space-x-1.5 ml-2 overflow-hidden py-0.5">
            {iconList.map((cit, idx) => (
              <FaviconIcon key={cit.id || idx} url={cit.url} domain={cit.domain || getDomain(cit.url)} />
            ))}
            {citations.length > iconList.length && (
              <span className="w-5 h-5 rounded-full bg-muted border border-border flex items-center justify-center text-[9px] font-bold text-muted-foreground z-10">
                +{citations.length - iconList.length}
              </span>
            )}
          </div>
        </div>

        {/* Expand / Retract arrow button */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 group-hover:text-foreground shrink-0 ml-2">
          <span className="text-[11px] font-medium hidden sm:inline">
            {expanded ? 'Retract' : 'Expand'}
          </span>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </motion.div>
        </div>
      </button>

      {/* Expanded Grid of Source Cards */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-3">
              {citations.map((cit, i) => (
                <SourceTile key={cit.id || i} citation={cit} index={i} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
