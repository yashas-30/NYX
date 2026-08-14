// src/features/hf-explorer/components/SearchBar.tsx
import React, { useRef } from 'react';
import { MagnifyingGlass, XCircle, ArrowClockwise } from '@phosphor-icons/react';
import { SORT_OPTIONS } from '../constants/sort';
import type { SortMode } from '../types';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  sortMode: SortMode;
  onSortChange: (sort: SortMode) => void;
  isLoading: boolean;
  onRefresh: () => void;
  onClear: () => void;
  hasActiveQuery: boolean;
}

export function SearchBar({
  value,
  onChange,
  sortMode,
  onSortChange,
  isLoading,
  onRefresh,
  onClear,
  hasActiveQuery,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-0">
      {/* Search input row */}
      <div className="relative">
        <MagnifyingGlass
          size={13}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#52525b] pointer-events-none z-10"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search Hugging Face and staff picks"
          className="w-full bg-[#2a2a2a] border-0 text-[12px] py-2.5 pl-8 pr-7 outline-none text-[#e4e4e7] placeholder:text-[#52525b] transition-all"
          style={{ borderRadius: 0 }}
          aria-label="Search models"
        />
        {(value || hasActiveQuery) && (
          <button
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#52525b] hover:text-[#a1a1aa] transition-colors"
            aria-label="Clear search"
          >
            <XCircle size={13} weight="fill" />
          </button>
        )}
      </div>

      {/* Staff picks row */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1c1c1c]">
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 text-[11px] text-[#71717a] hover:text-[#a1a1aa] transition-colors"
        >
          <span>Staff picks</span>
          <ArrowClockwise
            size={11}
            className={`transition-transform ${isLoading ? 'animate-spin' : ''}`}
          />
        </button>
        <div className="relative">
          <select
            value={sortMode}
            onChange={(e) => onSortChange(e.target.value as SortMode)}
            className="appearance-none bg-[#2a2a2a] border border-[#3f3f3f] rounded text-[11px] font-medium py-0.5 pl-2.5 pr-6 outline-none text-[#d4d4d8] cursor-pointer hover:border-[#52525b] transition-colors"
            aria-label="Sort models"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#1c1c1c] text-[#d4d4d8]">
                {opt.label}
              </option>
            ))}
          </select>
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-[#52525b] pointer-events-none">▾</span>
        </div>
      </div>
    </div>
  );
}
