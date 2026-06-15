export class LocalModelsService {
  // ==========================================
  // OLLAMA MANAGEMENT
  // ==========================================

  public async listOllamaModels(): Promise<any> {
    try {
      let response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(5000) }).catch(() => null);
      if (!response || !response.ok) {
        response = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(5000) }).catch(() => null);
      }
      if (!response || !response.ok) {
        // Fallback: Check local filesystem
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');
        const ollamaManifestPath = path.join(os.homedir(), '.ollama', 'models', 'manifests', 'registry.ollama.ai', 'library');
        try {
          if (fs.existsSync(ollamaManifestPath)) {
            const models = [];
            const folders = fs.readdirSync(ollamaManifestPath);
            for (const folder of folders) {
              const tagsPath = path.join(ollamaManifestPath, folder);
              if (fs.statSync(tagsPath).isDirectory()) {
                const tags = fs.readdirSync(tagsPath);
                for (const tag of tags) {
                  models.push({
                    name: `${folder}:${tag}`,
                    details: { parameter_size: 'unknown', family: 'unknown' }
                  });
                }
              }
            }
            if (models.length > 0) return { models };
          }
        } catch (e) {
           // ignore filesystem errors and throw the original error
        }
        throw new Error('Ollama not running or returned error');
      }
      return await response.json();
    } catch (error: any) {
      throw new Error(`Failed to list Ollama models: ${error.message}`);
    }
  }

  public async pullOllamaModel(modelName: string): Promise<any> {
    try {
      const response = await fetch('http://127.0.0.1:11434/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: false }),
        signal: AbortSignal.timeout(10 * 60 * 1000), // 10 minute timeout for large model downloads
      });
      if (!response.ok) throw new Error(await response.text());
      return await response.json();
    } catch (error: any) {
      throw new Error(`Failed to pull Ollama model: ${error.message}`);
    }
  }

  public async deleteOllamaModel(modelName: string): Promise<any> {
    try {
      const response = await fetch('http://127.0.0.1:11434/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(await response.text());
      return { success: true };
    } catch (error: any) {
      throw new Error(`Failed to delete Ollama model: ${error.message}`);
    }
  }

  // ==========================================
  // LM STUDIO MANAGEMENT
  // ==========================================

  public async listLMStudioModels(): Promise<any> {
    const port = process.env.LMSTUDIO_PORT || '1234';
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/models`, {
        signal: AbortSignal.timeout(3000),
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => null);
      if (!response || !response.ok) {
        return { models: [], connected: false, port };
      }
      const data = await response.json();
      const models = (data.data || []).map((m: any) => ({
        name: m.id,
        id: m.id,
        details: {
          parameter_size: 'unknown',
          family: m.object || 'llm',
          format: 'gguf',
        },
      }));
      return { models, connected: true, port };
    } catch (error: any) {
      return { models: [], connected: false, port, error: error.message };
    }
  }

  // ==========================================
  // UNIFIED STATUS
  // ==========================================

  public async getLocalProviderStatus(): Promise<{
    ollama: { connected: boolean; models: any[]; port: string };
    lmstudio: { connected: boolean; models: any[]; port: string };
  }> {
    const [ollamaResult, lmstudioResult] = await Promise.allSettled([
      this.listOllamaModels().catch(() => ({ models: [], connected: false })),
      this.listLMStudioModels(),
    ]);

    const ollamaData: any = ollamaResult.status === 'fulfilled' ? ollamaResult.value : { models: [], connected: false };
    const lmstudioData: any = lmstudioResult.status === 'fulfilled' ? lmstudioResult.value : { models: [], connected: false };

    return {
      ollama: {
        connected: !!(ollamaData.models?.length),
        models: ollamaData.models || [],
        port: '11434',
      },
      lmstudio: {
        connected: lmstudioData.connected ?? false,
        models: lmstudioData.models || [],
        port: lmstudioData.port || '1234',
      },
    };
  }
}
