let modelPromise: any = null;

async function getModel() {
  if (typeof window === 'undefined') return null;
  if (!modelPromise) {
    modelPromise = (async () => {
      try {
        const { pipeline, env } = await import('@xenova/transformers');
        env.allowLocalModels = false;
        env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/';
        return await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      } catch (e) {
        console.warn('[EmbeddingService] transformers.js model load failed, using fallback hash embedding:', e);
        return null;
      }
    })();
  }
  return modelPromise;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = await getModel();
  if (model) {
    try {
      const output = await model(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (e) {
      console.warn('[EmbeddingService] Inference failed, using fallback:', e);
    }
  }
  return hashEmbedding(text);
}

function hashEmbedding(text: string): number[] {
  const dim = 384;
  const vec = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const index = (i * 31 + charCode) % dim;
    vec[index] += charCode / 65535;
  }
  const sumSq = vec.reduce((sum, val) => sum + val * val, 0);
  const norm = Math.sqrt(sumSq);
  return norm > 0 ? vec.map(v => v / norm) : vec;
}
