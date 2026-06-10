import React from 'react';
import { ExternalLink, BookOpen } from 'lucide-react';

interface CitationCardProps {
  id: string;
  source: string;
  title?: string;
  url?: string;
  snippet?: string;
  onClick?: () => void;
}

export const CitationCard: React.FC<CitationCardProps> = ({
  id,
  source,
  title,
  url,
  snippet,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`
        p-3 rounded-md bg-[#09090B] border border-[rgba(255,255,255,0.06)]
        hover:bg-[#18181B] transition-colors cursor-pointer group flex flex-col gap-2
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-primary">
          <span className="text-[11px] font-mono bg-[#00363e] text-[#a2eeff] px-1.5 py-0.5 rounded-sm">
            [{id}]
          </span>
          <span className="text-[13px] font-medium font-sans truncate max-w-[200px]">
            {title || source}
          </span>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#4A5059] hover:text-primary transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {snippet && (
        <p className="text-[13px] text-[#4A5059] line-clamp-2 leading-relaxed">{snippet}</p>
      )}

      {!snippet && url && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#4A5059] font-mono mt-1">
          <BookOpen className="w-3 h-3" />
          <span className="truncate">{url.replace(/^https?:\/\/(www\.)?/, '')}</span>
        </div>
      )}
    </div>
  );
};
