import re

def main():
    file_path = r"e:\NYX\apps\web\src\features\model-registry\components\HuggingFaceExplorer.tsx"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Remove text near HF logo
    content = content.replace(
"""          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-yellow-400 flex items-center justify-center shadow-sm">
              <span className="text-white font-black text-[10px] leading-none">HF</span>
            </div>
            <div>
              <div className="text-xs font-black text-foreground tracking-tight leading-none">Hugging Face</div>
              <div className="text-[10px] text-muted-foreground leading-none mt-0.5">GGUF Explorer</div>
            </div>
          </div>
          <div className="h-5 w-px bg-border" />""",
"""          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-yellow-400 flex items-center justify-center shadow-sm">
              <span className="text-white font-black text-[10px] leading-none">HF</span>
            </div>
          </div>
          <div className="h-4 w-px bg-border" />"""
    )

    # 2. Make token smaller
    content = content.replace(
        'className="bg-background border border-border rounded-lg text-[10px] py-2 pl-7 pr-7 w-40 outline-none focus:border-primary/60 transition-all placeholder:text-muted-foreground/30"',
        'className="bg-background border border-border rounded-md text-[10px] py-1.5 pl-6 pr-6 w-32 outline-none focus:border-primary/60 transition-all placeholder:text-muted-foreground/30"'
    )

    # 3. Add Sort and Tasks near the search bar
    # The search bar area is:
    search_bar = """          <div className="flex-1 relative">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search GGUF models — e.g. Llama 3, Qwen, Mistral…"
              className="w-full bg-background border border-border rounded-lg text-xs py-2 pl-9 pr-8 outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40"
            />
            {(searchQuery || activeQuery) && (
              <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors">
                <XCircle size={14} weight="fill" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="shrink-0 flex items-center gap-1.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-sm"
          >
            {isLoading ? <Spinner size={13} className="animate-spin" /> : <MagnifyingGlass size={13} weight="bold" />}
            {isLoading ? 'Loading…' : 'Search'}
          </button>"""

    new_search_area = """          <div className="flex-1 relative">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search GGUF models — e.g. Llama 3, Qwen, Mistral…"
              className="w-full bg-background border border-border rounded-md text-xs py-1.5 pl-8 pr-8 outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40"
            />
            {(searchQuery || activeQuery) && (
              <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors">
                <XCircle size={14} weight="fill" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="shrink-0 flex items-center gap-1.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-md transition-all shadow-sm"
          >
            {isLoading ? <Spinner size={13} className="animate-spin" /> : <MagnifyingGlass size={13} weight="bold" />}
            {isLoading ? 'Loading…' : 'Search'}
          </button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar shrink-0 max-w-[400px]">
             {CATEGORIES.map(cat => (
               <button key={cat.id} onClick={() => handleCategoryChange(cat.id)} className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${activeCategory === cat.id ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-foreground/70 hover:bg-muted'}`}>
                 {cat.icon} {cat.label}
               </button>
             ))}
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="relative shrink-0 group">
             <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium bg-muted/50 text-foreground/70 hover:bg-muted transition-all">
                {SORT_OPTIONS.find(s => s.value === sortMode)?.icon} Sort
             </button>
             <div className="absolute right-0 top-full mt-1 w-36 bg-popover border border-border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                {SORT_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => handleSortChange(opt.value as SortMode)} className={`w-full text-left flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors ${sortMode === opt.value ? 'bg-muted/30 text-primary font-medium' : 'text-foreground/80'}`}>
                     {opt.icon} {opt.label}
                  </button>
                ))}
             </div>
          </div>"""

    content = content.replace(search_bar, new_search_area)

    # 4. Remove the Categories and Sort from the old place below
    old_filters_area = """              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-1 shrink-0">Tasks</span>
                  {CATEGORIES.map(cat => (
                    <button key={cat.id} onClick={() => handleCategoryChange(cat.id)} className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${activeCategory === cat.id ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-foreground/70 hover:bg-muted'}`}>
                      {cat.icon} {cat.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-1 shrink-0">Sort</span>
                  {SORT_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => handleSortChange(opt.value as SortMode)} className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${sortMode === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-foreground/70 hover:bg-muted'}`}>
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>"""
    
    content = content.replace(old_filters_area, "")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    main()
