// src/features/hf-explorer/components/SearchBar.tsx
import React, { useRef } from 'react';
import { MagnifyingGlass, XCircle, ArrowsDownUp } from '@phosphor-icons/react';
import { SORT_OPTIONS } from '../constants/sort';
import { TaskCategorySelector } from './TaskCategorySelector';
import { LibraryCategorySelector } from './LibraryCategorySelector';
import type { SortMode } from '../types';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  activeCategory: string;
  onCategoryChange: (id: string) => void;
  activeLibrary: string;
  onLibraryChange: (id: string) => void;
  sortMode: SortMode;
  onSortChange: (sort: SortMode) => void;
  isLoading: boolean;
  onClear: () => void;
  hasActiveQuery: boolean;
}

export function SearchBar({
  value,
  onChange,
  activeCategory,
  onCategoryChange,
  activeLibrary,
  onLibraryChange,
  sortMode,
  onSortChange,
  isLoading: _isLoading,
  onClear,
  hasActiveQuery,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 flex flex-wrap items-center gap-2 min-w-0">
      {/* Search Input Box */}
      <div className="flex-1 relative min-w-[200px]">
        <MagnifyingGlass
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search Hugging Face models — e.g. Llama 3, Diffusers, Qwen…"
          className="w-full bg-background border border-border/80 rounded-xl text-xs py-2 pl-9 pr-8 outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40 shadow-xs"
          aria-label="Search models"
        />
        {(value || hasActiveQuery) && (
          <button
            onClick={onClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <XCircle size={14} weight="fill" />
          </button>
        )}
      </div>

      {/* Rich Sectioned Category / Task Selector Popover */}
      <TaskCategorySelector
        activeCategory={activeCategory}
        onCategoryChange={onCategoryChange}
      />

      {/* Library Format Filter Selector Popover */}
      <LibraryCategorySelector
        activeLibrary={activeLibrary}
        onLibraryChange={onLibraryChange}
      />

      {/* Sort Option Dropdown Select */}
      <div className="relative shrink-0 flex items-center">
        <ArrowsDownUp size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none z-10" />
        <select
          value={sortMode}
          onChange={(e) => onSortChange(e.target.value as SortMode)}
          className="bg-background border border-border/80 rounded-xl text-xs font-semibold py-2 pl-7 pr-7 outline-none focus:border-primary/60 transition-all appearance-none cursor-pointer text-foreground shadow-xs hover:bg-muted/30"
          aria-label="Sort models"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-popover text-popover-foreground">
              {opt.label}
            </option>
          ))}
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground pointer-events-none">▼</span>
      </div>
    </div>
  );
}
