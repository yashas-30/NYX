import React from 'react';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { Globe, Search, BookOpen } from 'lucide-react';

export const SearchSettingsSection: React.FC = () => {
  const searchProvider = useNyxStore((state) => state.searchProvider) || 'duckduckgo';
  const setSearchProvider = useNyxStore((state) => state.setSearchProvider);

  const OPTIONS = [
    {
      id: 'duckduckgo',
      name: 'DuckDuckGo (HTML)',
      desc: 'Free, private web search. Extracts titles, links, and text snippets directly from DuckDuckGo Lite without external API keys.',
      icon: <Search className="w-5 h-5 text-muted-foreground" />,
      requiresKey: false,
    },
    {
      id: 'tavily',
      name: 'Tavily Search API',
      desc: 'Real-time search engine optimized specifically for LLMs. Returns high-quality, pre-cleaned content blocks for precise search grounding.',
      icon: <Globe className="w-5 h-5 text-accent" />,
      requiresKey: true,
    },
    {
      id: 'jina',
      name: 'Jina Reader Search',
      desc: 'Converts search results and web content directly into clean, LLM-friendly markdown. Ideal for long-context search analysis.',
      icon: <BookOpen className="w-5 h-5 text-emerald-400" />,
      requiresKey: true,
    },
  ] as const;

  return (
    <div className="mt-6 group p-5 rounded-md bg-card border border-border hover:border-accent/25 transition-all duration-300 relative overflow-hidden shadow-sm">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent/50 via-accent/30 to-accent/50 opacity-70 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-accent">
            SEARCH GROUNDING ENGINE
          </p>
          <h3 className="text-xs font-bold text-foreground mt-0.5">Active Web Search Provider</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {OPTIONS.map((opt) => {
          const isSelected = searchProvider === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setSearchProvider(opt.id)}
              className={`relative p-4 rounded-md border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[140px] ${
                isSelected
                  ? 'bg-accent/10 border-accent/40 shadow-sm shadow-accent/5'
                  : 'bg-background/60 border-border hover:border-border/60 hover:bg-secondary/40'
              }`}
            >
              {isSelected && (
                <div className="absolute top-3 right-3 w-1.5 h-1.5 rounded-md bg-accent animate-pulse" />
              )}
              
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {opt.icon}
                  <span className="text-xs font-bold text-foreground">{opt.name}</span>
                </div>
                <p className="text-[10px] text-muted-foreground/80 leading-normal">
                  {opt.desc}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span
                  className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${
                    isSelected
                      ? 'bg-accent/20 text-accent border-accent/30'
                      : 'bg-secondary text-muted-foreground/50 border-border'
                  }`}
                >
                  {isSelected ? 'Active' : 'Select'}
                </span>
                {opt.requiresKey && (
                  <span className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                    Requires Key
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/60 leading-relaxed mt-4">
        * Tavily and Jina Search require their respective API keys to be configured in the API Keys tab. If missing, searches will fail or fall back depending on agent policies.
      </p>
    </div>
  );
};
