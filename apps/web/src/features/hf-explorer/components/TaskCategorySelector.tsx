// src/features/hf-explorer/components/TaskCategorySelector.tsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Funnel, Check, MagnifyingGlass, XCircle, CaretDown } from '@phosphor-icons/react';
import { CATEGORY_GROUPS, ALL_CATEGORIES } from '../constants/categories';

interface TaskCategorySelectorProps {
  activeCategory: string;
  onCategoryChange: (id: string) => void;
}

export function TaskCategorySelector({
  activeCategory,
  onCategoryChange,
}: TaskCategorySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeItem = useMemo(() => {
    return ALL_CATEGORIES.find((c) => c.id === activeCategory) || ALL_CATEGORIES[0];
  }, [activeCategory]);

  // Close popup on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus search input when opened
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Filter categories by search term
  const filteredGroups = useMemo(() => {
    if (!searchFilter.trim()) return CATEGORY_GROUPS;
    const query = searchFilter.toLowerCase();
    
    return CATEGORY_GROUPS.map((group) => {
      const matchingCategories = group.categories.filter(
        (c) => c.label.toLowerCase().includes(query) || c.id.toLowerCase().includes(query)
      );
      return {
        ...group,
        categories: matchingCategories,
      };
    }).filter((group) => group.categories.length > 0);
  }, [searchFilter]);

  const filteredFeatured = useMemo(() => {
    const featured = ALL_CATEGORIES.filter((c) => c.section === 'Featured');
    if (!searchFilter.trim()) return featured;
    const query = searchFilter.toLowerCase();
    return featured.filter(
      (c) => c.label.toLowerCase().includes(query) || c.id.toLowerCase().includes(query)
    );
  }, [searchFilter]);

  return (
    <div ref={containerRef} className="relative shrink-0 flex items-center">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 bg-background border border-border/80 rounded-xl text-xs font-semibold py-1.5 px-3 outline-none focus:border-primary/60 hover:bg-muted/30 transition-all text-foreground shadow-xs cursor-pointer"
        aria-expanded={isOpen}
        aria-label="Filter by task category"
      >
        <Funnel size={13} className="text-primary shrink-0" />
        <span className="truncate max-w-[140px] text-left">
          {activeItem.label}
        </span>
        <CaretDown size={11} className={`text-muted-foreground transition-transform duration-150 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-76 max-w-[90vw] bg-popover border border-border/80 rounded-2xl shadow-2xl z-[100] overflow-hidden flex flex-col animate-in fade-in-50 zoom-in-95 duration-100">
          
          {/* Quick Search Header */}
          <div className="p-2 border-b border-border/60 bg-muted/20">
            <div className="relative flex items-center">
              <MagnifyingGlass size={13} className="absolute left-2.5 text-muted-foreground/60 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter task types…"
                className="w-full bg-background border border-border/60 rounded-xl text-xs py-1.5 pl-8 pr-7 outline-none focus:border-primary/60 transition-all placeholder:text-muted-foreground/50"
              />
              {searchFilter && (
                <button
                  type="button"
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2 text-muted-foreground hover:text-foreground"
                >
                  <XCircle size={13} weight="fill" />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Categories List */}
          <div className="max-h-[360px] overflow-y-auto p-1.5 custom-scrollbar space-y-3">
            
            {/* Featured Section */}
            {filteredFeatured.length > 0 && (
              <div>
                <div className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase text-muted-foreground/70">
                  Featured
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {filteredFeatured.map((item) => {
                    const isSelected = item.id === activeCategory;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onCategoryChange(item.id);
                          setIsOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left ${
                          isSelected
                            ? 'bg-primary/15 text-primary font-semibold'
                            : 'hover:bg-muted/50 text-foreground'
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        {isSelected && <Check size={13} className="text-primary shrink-0 ml-2" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Categorized Groups */}
            {filteredGroups.map((group) => (
              <div key={group.name}>
                <div className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase text-muted-foreground/70 flex items-center gap-1.5">
                  {group.icon}
                  <span>{group.name}</span>
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {group.categories.map((item) => {
                    const isSelected = item.id === activeCategory;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onCategoryChange(item.id);
                          setIsOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left ${
                          isSelected
                            ? 'bg-primary/15 text-primary font-semibold'
                            : 'hover:bg-muted/50 text-foreground'
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        {isSelected && <Check size={13} className="text-primary shrink-0 ml-2" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {filteredFeatured.length === 0 && filteredGroups.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No matching tasks found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
