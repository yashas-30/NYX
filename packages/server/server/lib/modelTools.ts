import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

export class ModelTools {
  /**
   * Quantizes an FP16/BF16 GGUF file to a smaller format (e.g., Q4_K_M).
   * Runs the `llama-quantize` native binary.
   */
  static quantizeModel(
    inputPath: string,
    outputPath: string,
    format: string = 'Q4_K_M'
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[ModelTools] Quantizing ${inputPath} to ${format}...`);
      const quantize = spawn('llama-quantize', [inputPath, outputPath, format]);

      quantize.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Quantization failed with code ${code}`));
      });
    });
  }

  /**
   * Merges a trained LoRA adapter directly into the base GGUF model using `llama-export-lora`.
   */
  static mergeLoRA(baseModelPath: string, loraPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[ModelTools] Merging LoRA ${loraPath} into ${baseModelPath}...`);
      const merge = spawn('llama-export-lora', [
        '-m',
        baseModelPath,
        '--lora',
        loraPath,
        '-o',
        outputPath,
      ]);

      merge.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`LoRA merge failed with code ${code}`));
      });
    });
  }

  /**
   * Orchestrates full local LoRA fine-tuning by spawning an isolated Python/PyTorch environment.
   * This assumes `train.py` is bundled in the app and `pip install -r requirements.txt` has run.
   */
  static startLoRATraining(
    baseModelPath: string,
    datasetPath: string,
    outputDir: string,
    onProgress: (log: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.resolve(_dirname, '../../python/train.py');
      console.log(`[ModelTools] Starting full LoRA training using PyTorch at ${scriptPath}...`);

      const train = spawn('python', [
        scriptPath,
        '--model',
        baseModelPath,
        '--dataset',
        datasetPath,
        '--output_dir',
        outputDir,
        '--use_peft', // Triggers LoRA config
      ]);

      train.stdout.on('data', (data) => onProgress(data.toString()));
      train.stderr.on('data', (data) => onProgress(data.toString()));

      train.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`LoRA training failed with code ${code}`));
      });
    });
  }

  /**
   * Distributed inference: Discovers or connects to worker nodes via RPC.
   * Simple Master/Worker RPC setup via llama.cpp's `llama-rpc-server`.
   */
  static startDistributedWorker(port: number = 50052): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[ModelTools] Starting RPC worker on port ${port}...`);
      const rpcServer = spawn('llama-rpc-server', ['--port', port.toString(), '--host', '0.0.0.0']);

      rpcServer.on('close', (code) => {
        if (code !== 0) reject(new Error(`RPC Server failed with code ${code}`));
      });
      // Resolve immediately as it runs as a daemon
      resolve();
    });
  }
}
