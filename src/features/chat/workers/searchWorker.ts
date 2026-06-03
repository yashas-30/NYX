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
    const res = await fetch('/api/v1/tools/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: prompt })
    });
    
    if (!res.ok) {
      throw new Error(`Search failed: ${res.statusText}`);
    }
    
    const data = await res.json();
    self.postMessage({ context: data.context || JSON.stringify(data) } as SearchWorkerResponse);
  } catch (error: any) {
    self.postMessage({ error: error.message, context: '' } as SearchWorkerResponse);
  }
};
