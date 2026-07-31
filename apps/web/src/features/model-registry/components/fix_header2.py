import re

def main():
    file_path = r"e:\NYX\apps\web\src\features\model-registry\components\HuggingFaceExplorer.tsx"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # The exact block from the file
    old_search_area = """          <div className="flex-1 relative">
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
          </button>
          {/* Token */}
          <div className="relative shrink-0 flex items-center">
            <Key size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none z-10" />
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="HF Token (optional)"
              className="bg-background border border-border rounded-md text-[10px] py-1.5 pl-6 pr-6 w-32 outline-none focus:border-primary/60 transition-all placeholder:text-muted-foreground/30"
            />
            <button onClick={() => setShowToken(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
              <Eye size={11} weight={showToken ? 'fill' : 'regular'} />
            </button>
          </div>"""

    new_search_area = """          <div className="flex-1 relative">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search GGUF models..."
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
            {isLoading ? 'Loading...' : 'Search'}
          </button>
          
          <div className="h-4 w-px bg-border" />
          
          {/* Categories */}
          <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar shrink-0 max-w-[400px]">
             {CATEGORIES.map(cat => (
               <button key={cat.id} onClick={() => handleCategoryChange(cat.id)} className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${activeCategory === cat.id ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-foreground/70 hover:bg-muted'}`}>
                 {cat.icon} {cat.label}
               </button>
             ))}
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Sort Dropdown */}
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
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Token */}
          <div className="relative shrink-0 flex items-center">
            <Key size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none z-10" />
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="HF Token"
              className="bg-background border border-border rounded-md text-[10px] py-1.5 pl-6 pr-6 w-24 outline-none focus:border-primary/60 transition-all placeholder:text-muted-foreground/30"
            />
            <button onClick={() => setShowToken(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
              <Eye size={11} weight={showToken ? 'fill' : 'regular'} />
            </button>
          </div>"""

    # We need to account for unicode characters in the original file
    # I'll just use regex replacement for safety.
    pattern = re.compile(r'<div className="flex-1 relative">.*?<div className="relative shrink-0 flex items-center">.*?</div>', re.DOTALL)
    
    # But new_search_area is exactly what we want to replace the matched block with.
    # Wait, the match ends at the first </div> after <div className="relative shrink-0 flex items-center">, but there are multiple divs inside.
    # Let's just find indices manually
    
    start_idx = content.find('<div className="flex-1 relative">')
    token_idx = content.find('className="bg-background border border-border rounded-md text-[10px] py-1.5 pl-6 pr-6 w-32 outline-none focus:border-primary/60 transition-all placeholder:text-muted-foreground/30"')
    end_idx = content.find('</div>', token_idx) + 6 # Include the </div>
    
    # Add one more </div> for the parent
    end_idx = content.find('</div>', end_idx) + 6
    
    if start_idx != -1 and token_idx != -1:
        content = content[:start_idx] + new_search_area + content[end_idx:]
    else:
        print("Failed to find boundaries")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    main()
