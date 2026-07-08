self.onmessage = async (e) => {
  const { text, id } = e.data;

  let pipeline: any = null;

  try {
    // Dynamically load @xenova/transformers (optional dependency).
    // This works in the desktop Tauri app and modern browsers that support WASM.
    const { pipeline: createPipeline } = await import(
      /* @vite-ignore */ '@xenova/transformers'
    );

    // Use the smallest production-quality embedding model.
    // 'Xenova/all-MiniLM-L6-v2' is 23 MB, outputs 384-dim embeddings.
    pipeline = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
    });

    const output = await pipeline(text, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data as Float32Array);

    self.postMessage({ id, embedding, error: null });
  } catch (err: any) {
    // @xenova/transformers failed to load (network, WASM denied, missing dep).
    // Signal failure clearly so callers can surface the limitation instead of
    // silently using meaningless random vectors.
    self.postMessage({
      id,
      embedding: null,
      error: err?.message ?? 'Embedding model unavailable in this build.',
    });
  }
};
