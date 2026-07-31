import re

filepath = 'e:/NYX/apps/web/src/features/model-registry/components/HuggingFaceExplorer.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = "<div className=\"flex flex-1 min-h-0 relative\">"
end_marker = "              <div className=\"flex items-center gap-1.5 bg-muted/30 px-3 py-1.5 rounded-full border border-border/40\">"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    replacement = """<div className="flex flex-1 min-h-0 relative">

        {!selectedModel ? (
          /* List View */
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto custom-scrollbar">
            {/* Results header with integrated filters */}
            <div className="px-6 py-4 border-b border-border/50 bg-background/90 backdrop-blur-md shrink-0 flex flex-col gap-3 sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black text-foreground">Models</span>
                  {searchResults.length > 0 && (
                    <span className="text-sm font-medium text-muted-foreground">{formatCount(searchResults.length)}</span>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
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
              </div>
            </div>
"""
    new_content = content[:start_idx] + replacement + content[end_idx + len(end_marker):]
    new_content = new_content.replace('Ã‚Â·', '·')
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully replaced.")
else:
    print("Could not find markers.", start_idx, end_idx)
