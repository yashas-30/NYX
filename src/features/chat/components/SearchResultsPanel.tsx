import React from 'react';
import { Globe, Search, ArrowUpRight } from 'lucide-react';
import { CitationCard } from './CitationCard';

interface SearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
}

interface SearchResultsPanelProps {
  results: SearchResult[];
  query?: string;
  isSearching?: boolean;
}

export const SearchResultsPanel: React.FC<SearchResultsPanelProps> = ({ results, query, isSearching }) => {
  if (!isSearching && (!results || results.length === 0)) return null;

  return (
    <div className="flex flex-col gap-3 my-4 bg-[#0e1416] border border-[rgba(255,255,255,0.06)] p-4 rounded-md">
      <div className="flex items-center gap-2 pb-3 border-b border-[rgba(255,255,255,0.06)]">
        <Globe className={`w-4 h-4 ${isSearching ? 'text-[#FF3366] animate-spin' : 'text-[#4A5059]'}`} />
        <span className="text-[14px] font-medium text-[#F8FAFC]">
          {isSearching ? 'Gathering context...' : 'Search Context'}
        </span>
        {query && (
          <span className="text-[12px] font-mono text-[#4A5059] ml-2 truncate px-2 py-0.5 bg-[#18181B] rounded-sm">
            "{query}"
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
        {results.map((result, idx) => (
          <CitationCard
            key={result.id || idx}
            id={(idx + 1).toString()}
            source={result.title}
            title={result.title}
            url={result.url}
            snippet={result.snippet}
          />
        ))}
      </div>
      
      {results.length > 0 && (
        <div className="flex justify-end mt-1">
           <span className="text-[11px] font-mono text-[#4A5059] flex items-center gap-1">
             <Search className="w-3 h-3" />
             {results.length} sources found
           </span>
        </div>
      )}
    </div>
  );
};
