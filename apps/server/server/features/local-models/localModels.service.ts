export class LocalModelsService {
  // ==========================================
  // OLLAMA MANAGEMENT
  // ==========================================

  public async listOllamaModels(): Promise<any> {
    try {
      let response = await fetch('http://127.0.0.1:11434/api/tags').catch(() => null);
      if (!response || !response.ok) {
        response = await fetch('http://localhost:11434/api/tags').catch(() => null);
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
      });
      if (!response.ok) throw new Error(await response.text());
      return { success: true };
    } catch (error: any) {
      throw new Error(`Failed to delete Ollama model: ${error.message}`);
    }
  }
}
