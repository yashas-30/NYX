import React, { useRef } from 'react';
import { MagnifyingGlass, XCircle, Desktop, Cloud } from '@phosphor-icons/react';
import { SORT_OPTIONS } from '../constants/sort';
import type { SortMode } from '../types';

export type ExplorerTab = 'hf' | 'on-device' | 'cloud';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  sortMode: SortMode;
  onSortChange: (sort: SortMode) => void;
  isLoading: boolean;
  onClear: () => void;
  hasActiveQuery: boolean;
  activeTab: ExplorerTab;
  onTabChange: (tab: ExplorerTab) => void;
  onDeviceCount?: number;
}

export function SearchBar({
  value,
  onChange,
  sortMode,
  onSortChange,
  onClear,
  hasActiveQuery,
  activeTab,
  onTabChange,
  onDeviceCount = 0,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const getPlaceholder = () => {
    switch (activeTab) {
      case 'on-device':
        return 'Filter downloaded on-device models...';
      case 'cloud':
        return 'Filter cloud models...';
      case 'hf':
      default:
        return 'Search Hugging Face models...';
    }
  };

  return (
    <div className="flex flex-col gap-0 select-none">
      {/* Search input row */}
      <div className="relative">
        <MagnifyingGlass
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={getPlaceholder()}
          className="w-full bg-background border-0 text-[12px] py-2.5 pl-8 pr-7 outline-none text-foreground placeholder:text-muted-foreground transition-all"
          style={{ borderRadius: 0 }}
          aria-label="Search models"
        />
        {(value || hasActiveQuery) && (
          <button
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="Clear search"
          >
            <XCircle size={14} weight="fill" />
          </button>
        )}
      </div>

      {/* Big Mode Icons Row */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-t border-border">
        {/* Three big icons: Hugging Face, On-Device, Cloud */}
        <div className="flex items-center gap-2">
          {/* Hugging Face */}
          <button
            type="button"
            onClick={() => onTabChange('hf')}
            title="Hugging Face Online Library"
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              activeTab === 'hf'
                ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/40'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            <span className="text-[19px] leading-none select-none">🤗</span>
          </button>

          {/* On-Device */}
          <button
            type="button"
            onClick={() => onTabChange('on-device')}
            title="Downloaded On-Device Models"
            className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              activeTab === 'on-device'
                ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/40'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            <Desktop size={20} weight={activeTab === 'on-device' ? 'fill' : 'bold'} />
            {onDeviceCount > 0 && (
              <span
                className={`absolute -top-1 -right-1 text-[9px] min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full font-mono font-bold leading-none shadow-sm ${
                  activeTab === 'on-device'
                    ? 'bg-background text-foreground border border-border'
                    : 'bg-primary text-primary-foreground'
                }`}
              >
                {onDeviceCount}
              </span>
            )}
          </button>

          {/* Cloud */}
          <button
            type="button"
            onClick={() => onTabChange('cloud')}
            title="Cloud Models"
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              activeTab === 'cloud'
                ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/40'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            <Cloud size={20} weight={activeTab === 'cloud' ? 'fill' : 'bold'} />
          </button>
        </div>

        {/* Sort selector (only in HF explorer mode) */}
        {activeTab === 'hf' && (
          <div className="relative">
            <select
              value={sortMode}
              onChange={(e) => onSortChange(e.target.value as SortMode)}
              className="appearance-none bg-background border border-border rounded text-[11px] font-medium py-1 pl-2.5 pr-6 outline-none text-foreground cursor-pointer hover:border-border-strong transition-colors"
              aria-label="Sort models"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-popover text-foreground">
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-muted-foreground pointer-events-none">
              ▾
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
