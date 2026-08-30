// src/features/hf-explorer/hooks/useHfModels.ts
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { HfModelResult, SortMode, HfModelFile } from '../types';

interface SearchResponse {
  models: HfModelResult[];
  next_cursor: string | null;
}

const MODELS_QUERY_KEY = 'hf-models';

export function useHfModels(
  query: string,
  sort: SortMode,
  filter?: string,
  libraryFilter?: string
) {
  return useInfiniteQuery<SearchResponse, Error>({
    queryKey: [MODELS_QUERY_KEY, query, sort, filter, libraryFilter],
    queryFn: async ({ pageParam }) => {
      const response = await invoke<SearchResponse>('hf_search_models', {
        query,
        sort,
        filter: filter || undefined,
        library: libraryFilter && libraryFilter !== 'all' ? libraryFilter : undefined,
        limit: 50,
        cursor: pageParam as string | null,
      });
      return response;
    },
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    initialPageParam: null as string | null,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useHfModelFiles(modelId: string | null) {
  return useQuery<HfModelFile[], Error>({
    queryKey: ['hf-model-files', modelId],
    queryFn: async () => {
      if (!modelId) return [];
      const files = await invoke<HfModelFile[]>('hf_get_model_files', { modelId });
      return (files ?? []).sort((a, b) => a.size - b.size);
    },
    enabled: !!modelId,
    staleTime: 2 * 60 * 1000,
  });
}

// Strip YAML front matter only when the file starts with ---
// Using /s (dotAll) so . matches \n; no /m flag so ^ anchors at string start only.
function stripFrontMatter(text: string): string {
  return text
    .replace(/^---[\s\S]*?---\r?\n?/s, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
}

export function useHfModelReadme(modelId: string | null) {
  return useQuery<string, Error>({
    queryKey: ['hf-model-readme', modelId],
    queryFn: async () => {
      if (!modelId) return '';
      try {
        const readme = await invoke<string>('hf_get_model_readme', { modelId });
        const clean = stripFrontMatter(readme ?? '');
        if (clean && !clean.includes('HTTP 404') && !clean.includes('Failed to fetch')) {
          return clean;
        }
      } catch {
        // Fallback fetch via fetch API if Tauri invoke returns 404
      }

      // Try fallback direct HTTP fetches for master/main/lowercase paths
      const paths = [
        `https://huggingface.co/${modelId}/raw/main/README.md`,
        `https://huggingface.co/${modelId}/raw/main/readme.md`,
        `https://huggingface.co/${modelId}/raw/master/README.md`,
      ];
      for (const url of paths) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const clean = stripFrontMatter(await res.text());
            if (clean) return clean;
          }
        } catch {
          // ignore & try next
        }
      }
      return '';
    },
    enabled: !!modelId,
    staleTime: 5 * 60 * 1000,
  });
}
