// src/features/hf-explorer/stores/useHfExplorerStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SortMode } from '../types';

interface HfExplorerState {
  searchQuery: string;
  activeQuery: string;
  sortMode: SortMode;
  activeCategory: string;
  activeLibraryFilter: string;
  selectedModel: string | null;

  setSearchQuery: (query: string) => void;
  setActiveQuery: (query: string) => void;
  setSortMode: (sort: SortMode) => void;
  setActiveCategory: (category: string) => void;
  setActiveLibraryFilter: (library: string) => void;
  setSelectedModel: (modelId: string | null) => void;
  resetExplorer: () => void;
}

export const useHfExplorerStore = create<HfExplorerState>()(
  persist(
    (set) => ({
      searchQuery: '',
      activeQuery: '',
      sortMode: 'createdAt',
      activeCategory: 'all',
      activeLibraryFilter: 'gguf',
      selectedModel: null,

      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setActiveQuery: (activeQuery) => set({ activeQuery }),
      setSortMode: (sortMode) => set({ sortMode }),
      setActiveCategory: (activeCategory) => set({ activeCategory }),
      setActiveLibraryFilter: (activeLibraryFilter) => set({ activeLibraryFilter }),
      setSelectedModel: (selectedModel) => set({ selectedModel }),
      resetExplorer: () =>
        set({
          searchQuery: '',
          activeQuery: '',
          sortMode: 'createdAt',
          activeCategory: 'all',
          activeLibraryFilter: 'gguf',
          selectedModel: null,
        }),
    }),
    {
      name: 'nyx-hf-explorer-state',
      storage: createJSONStorage(() => sessionStorage), // Persist across tab switches within session
    }
  )
);
