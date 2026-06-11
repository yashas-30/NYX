import { GoogleGenAI } from '@google/genai';
import { Gateway } from '../../lib/gateway.js';

export interface EmbedOptions {
  provider: 'gemini' | 'ollama';
  model?: string; // Optional custom model
}

export class EmbeddingService {
  /**
   * Generates embeddings for a given text using the specified provider.
   */
  static async embedText(text: string, options: EmbedOptions): Promise<number[]> {
    if (options.provider === 'gemini') {
      const apiKey = Gateway.getActiveKey('gemini');
      if (!apiKey) {
        throw new Error('No API key found for Gemini embeddings.');
      }
      
      const ai = new GoogleGenAI({ apiKey });
      const modelName = options.model || 'text-embedding-004';
      
      const response = await ai.models.embedContent({
        model: modelName,
        contents: text,
      });
      
      if (response.embeddings && response.embeddings.length > 0 && response.embeddings[0].values) {
        return response.embeddings[0].values;
      }
      throw new Error('Gemini API returned no embedding values.');
    } 
    
    if (options.provider === 'ollama') {
      const modelName = options.model || 'nomic-embed-text';
      const url = 'http://127.0.0.1:11434/api/embeddings';
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName, prompt: text }),
      });
      
      if (!response.ok) {
        throw new Error(`Ollama API Error ${response.status}: Ensure Ollama is running and model ${modelName} is pulled.`);
      }
      
      const data: any = await response.json();
      if (data.embedding) {
        return data.embedding;
      }
      throw new Error('Ollama API returned no embedding values.');
    }

    throw new Error(`Unsupported embedding provider: ${options.provider}`);
  }
}
