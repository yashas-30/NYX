import { z } from 'zod';
import ivm from 'isolated-vm';

export const PluginManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string(),
  permissions: z.array(z.enum(['file-read', 'file-write', 'terminal', 'network', 'webcam', 'microphone'])),
  tools: z.array(z.any()), // Would be strictly typed in full implementation
  ui: z.object({
    components: z.array(z.string()).optional(),
    settings: z.array(z.any()).optional()
  }).optional()
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export class PluginSandbox {
  private isolate: ivm.Isolate;
  private context: ivm.Context;

  constructor() {
    this.isolate = new ivm.Isolate({ memoryLimit: 128 });
    this.context = this.isolate.createContextSync();
  }

  async executeCode(code: string, timeoutMs: number = 5000): Promise<any> {
    const script = await this.isolate.compileScript(code);
    return script.run(this.context, { timeout: timeoutMs });
  }

  dispose() {
    this.isolate.dispose();
  }
}
