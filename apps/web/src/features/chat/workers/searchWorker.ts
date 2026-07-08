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
    const data = await invoke<{ context: string }>('db_search_memories', { query: prompt });
    self.postMessage({ context: data.context || JSON.stringify(data) } as SearchWorkerResponse);
  } catch (error: any) {
    self.postMessage({ error: error.message, context: '' } as SearchWorkerResponse);
  }
};
