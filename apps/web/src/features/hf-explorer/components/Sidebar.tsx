// src/features/hf-explorer/components/Sidebar.tsx
import { CATEGORY_ICONS } from '../constants/categories';
import { SORT_OPTIONS } from '../constants/sort';
import { CATEGORIES } from '../constants/categories';
import type { SortMode } from '../types';

interface SidebarProps {
  activeCategory: string;
  onCategoryChange: (id: string) => void;
  sortMode: SortMode;
  onSortChange: (sort: SortMode) => void;
}

export function Sidebar({ activeCategory, onCategoryChange, sortMode, onSortChange }: SidebarProps) {
  return (
    <div className="w-[220px] shrink-0 border-r border-border/50 bg-background/50 p-4 flex flex-col gap-6 overflow-y-auto custom-scrollbar hidden md:flex">
      <div>
        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          Tasks
        </h3>
        <div className="flex flex-col gap-0.5" role="radiogroup" aria-label="Filter by task">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(cat.id)}
                role="radio"
                aria-checked={isActive}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all duration-150 text-left ${
                  isActive
                    ? 'bg-primary/10 text-primary font-bold'
                    : 'text-foreground/70 hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <span className={isActive ? 'opacity-100' : 'opacity-60'}>
                  {CATEGORY_ICONS[cat.id]}
                </span>
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          Sort By
        </h3>
        <div className="flex flex-col gap-0.5" role="radiogroup" aria-label="Sort models">
          {SORT_OPTIONS.map((opt) => {
            const isActive = sortMode === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onSortChange(opt.value as SortMode)}
                role="radio"
                aria-checked={isActive}
                className={`flex items-center px-3 py-2 rounded-lg text-xs transition-all duration-150 text-left ${
                  isActive
                    ? 'bg-primary/10 text-primary font-bold'
                    : 'text-foreground/70 hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
