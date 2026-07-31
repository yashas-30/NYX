import { invoke } from '@tauri-apps/api/core';

export interface SearchWorkerRequest {
  prompt: string;
}

export interface SearchWorkerResponse {
  context: string;
  error?: string;
}

self.onmessage = async (e: MessageEvent<SearchWorkerRequest>) => {
  const { prompt } = e.data;
  try {
    const data = await invoke<any[]>('db_search_memories', { query: prompt, topK: 5 });
    const formatted = Array.isArray(data)
      ? data.map(item => `- ${item.fact} (${item.category})`).join('\n')
      : JSON.stringify(data);
    self.postMessage({ context: formatted } as SearchWorkerResponse);
  } catch (error: any) {
    self.postMessage({ error: error.message, context: '' } as SearchWorkerResponse);
  }
};
