import fs from 'fs';
import path from 'path';
import https from 'https';
import { IncomingMessage, ClientRequest } from 'http';
import os from 'os';
import * as si from 'systeminformation';
import logger from '../../lib/logger.ts';
// No download queue needed — downloads are tracked per-modelId in activeDownloads map


export interface ModelPreset {
  id: string;
  name: string;
  provider: string;
  size: string;
  url: string;
  fileName: string;
  description: string;
  ramRequired: string;
  vramRequired?: string;
  paramCount?: string;
  quantization?: string;
  contextLength?: string;
  featured?: boolean;
}

export const MODEL_PRESETS: ModelPreset[] = [

  // ── GOOGLE ──────────────────────────────────────────────────────────────
  {
    id: 'nyx-gemma-4-e2b-it',
    name: 'Gemma 4 E2B Instruct (Q4_K_M)',
    provider: 'google',
    paramCount: '2.3B',
    quantization: 'Q4_K_M',
    contextLength: '8K',
    size: '1.6 GB',
    url: 'https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-Q4_K_M.gguf',
    fileName: 'google_gemma-4-E2B-it-Q4_K_M.gguf',
    description: 'Ultra-efficient Google Gemma 4 edge model — the NYX native agent brain. Fast, smart, runs entirely on-device.',
    ramRequired: '4 GB RAM',
    vramRequired: '2 GB VRAM',
    featured: true
  },
  {
    id: 'gemma-2-2b-it',
    name: 'Gemma 2 2B Instruct (Q4_K_M)',
    provider: 'google',
    paramCount: '2.6B',
    quantization: 'Q4_K_M',
    contextLength: '8K',
    size: '1.7 GB',
    url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
    fileName: 'gemma-2-2b-it-Q4_K_M.gguf',
    description: 'Google\'s Gemma 2 2B instruct model. Power-packed reasoning and instruction following at edge scale.',
    ramRequired: '4 GB RAM',
    vramRequired: '2 GB VRAM'
  },
  {
    id: 'gemma-2-9b-it',
    name: 'Gemma 2 9B Instruct (Q4_K_M)',
    provider: 'google',
    paramCount: '9B',
    quantization: 'Q4_K_M',
    contextLength: '8K',
    size: '5.7 GB',
    url: 'https://huggingface.co/bartowski/gemma-2-9b-it-GGUF/resolve/main/gemma-2-9b-it-Q4_K_M.gguf',
    fileName: 'gemma-2-9b-it-Q4_K_M.gguf',
    description: 'Google\'s highly popular Gemma 2 9B model. Extremely strong performance matching larger models.',
    ramRequired: '12 GB RAM',
    vramRequired: '8 GB VRAM'
  },
  {
    id: 'gemma-3-4b-it',
    name: 'Gemma 3 4B Instruct (Q4_K_M)',
    provider: 'google',
    paramCount: '4B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '2.5 GB',
    url: 'https://huggingface.co/bartowski/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf',
    fileName: 'gemma-3-4b-it-Q4_K_M.gguf',
    description: 'Google\'s Gemma 3 4B with 128K context window. Excellent general assistant capabilities in a compact footprint.',
    ramRequired: '6 GB RAM',
    vramRequired: '4 GB VRAM'
  },
  {
    id: 'gemma-3-12b-it',
    name: 'Gemma 3 12B Instruct (Q4_K_M)',
    provider: 'google',
    paramCount: '12B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '7.3 GB',
    url: 'https://huggingface.co/bartowski/gemma-3-12b-it-GGUF/resolve/main/gemma-3-12b-it-Q4_K_M.gguf',
    fileName: 'gemma-3-12b-it-Q4_K_M.gguf',
    description: 'Google\'s mid-size Gemma 3 — powerful reasoning and coding with a massive 128K context window.',
    ramRequired: '12 GB RAM',
    vramRequired: '8 GB VRAM'
  },
  {
    id: 'gemma-3-27b-it',
    name: 'Gemma 3 27B Instruct (Q4_K_M)',
    provider: 'google',
    paramCount: '27B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '18.2 GB',
    url: 'https://huggingface.co/bartowski/gemma-3-27b-it-GGUF/resolve/main/gemma-3-27b-it-Q4_K_M.gguf',
    fileName: 'gemma-3-27b-it-Q4_K_M.gguf',
    description: 'Google\'s largest Gemma 3 model — flagship performance for local systems with larger RAM sizes.',
    ramRequired: '32 GB RAM',
    vramRequired: '16 GB VRAM'
  },

  // ── META (LLAMA) ─────────────────────────────────────────────────────────
  {
    id: 'llama-3.2-1b-native',
    name: 'Llama 3.2 1B Instruct (Q4_K_M)',
    provider: 'meta',
    paramCount: '1B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '0.8 GB',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    fileName: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    description: 'Blazing fast 1B Meta model — perfect for edge devices and rapid completion tasks with minimal RAM footprint.',
    ramRequired: '2 GB RAM',
    vramRequired: '1 GB VRAM'
  },
  {
    id: 'llama-3.2-3b-native',
    name: 'Llama 3.2 3B Instruct (Q4_K_M)',
    provider: 'meta',
    paramCount: '3B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '2.0 GB',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    fileName: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    description: 'Meta\'s capable 3B general instruction model — great all-rounder for conversations and reasoning at any scale.',
    ramRequired: '4 GB RAM',
    vramRequired: '2 GB VRAM'
  },
  {
    id: 'llama-3-8b-instruct',
    name: 'Llama 3 8B Instruct (Q4_K_M)',
    provider: 'meta',
    paramCount: '8B',
    quantization: 'Q4_K_M',
    contextLength: '8K',
    size: '4.9 GB',
    url: 'https://huggingface.co/bartowski/Meta-Llama-3-8B-Instruct-GGUF/resolve/main/Meta-Llama-3-8B-Instruct-Q4_K_M.gguf',
    fileName: 'Meta-Llama-3-8B-Instruct-Q4_K_M.gguf',
    description: 'The original Llama 3 8B instruct model. Fast, robust, and highly capable general assistant.',
    ramRequired: '8 GB RAM',
    vramRequired: '6 GB VRAM'
  },
  {
    id: 'llama-3.1-8b-native',
    name: 'Llama 3.1 8B Instruct (Q4_K_M)',
    provider: 'meta',
    paramCount: '8B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '4.9 GB',
    url: 'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
    fileName: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
    description: 'The iconic Llama 3.1 8B — Meta\'s workhorse model with outstanding instruction following and 128K context.',
    ramRequired: '8 GB RAM',
    vramRequired: '6 GB VRAM',
    featured: true
  },
  {
    id: 'llama-3.3-70b-native',
    name: 'Llama 3.3 70B Instruct (Q4_K_M)',
    provider: 'meta',
    paramCount: '70B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '42.5 GB',
    url: 'https://huggingface.co/bartowski/Llama-3.3-70B-Instruct-GGUF/resolve/main/Llama-3.3-70B-Instruct-Q4_K_M.gguf',
    fileName: 'Llama-3.3-70B-Instruct-Q4_K_M.gguf',
    description: 'Meta\'s flagship 70B — frontier-class intelligence rivaling GPT-4. Requires high-end hardware.',
    ramRequired: '48 GB RAM',
    vramRequired: '24 GB VRAM'
  },
  {
    id: 'codellama-7b-instruct',
    name: 'Code Llama 7B Instruct (Q4_K_M)',
    provider: 'meta',
    paramCount: '7B',
    quantization: 'Q4_K_M',
    contextLength: '16K',
    size: '4.1 GB',
    url: 'https://huggingface.co/TheBloke/CodeLlama-7B-Instruct-GGUF/resolve/main/codellama-7b-instruct.Q4_K_M.gguf',
    fileName: 'codellama-7b-instruct.Q4_K_M.gguf',
    description: 'Meta\'s specialized Code Llama — purpose-built for code generation, completion, and debugging tasks.',
    ramRequired: '6 GB RAM',
    vramRequired: '4 GB VRAM'
  },
  {
    id: 'codellama-13b-instruct',
    name: 'Code Llama 13B Instruct (Q4_K_M)',
    provider: 'meta',
    paramCount: '13B',
    quantization: 'Q4_K_M',
    contextLength: '16K',
    size: '8.3 GB',
    url: 'https://huggingface.co/TheBloke/CodeLlama-13B-Instruct-GGUF/resolve/main/codellama-13b-instruct.Q4_K_M.gguf',
    fileName: 'codellama-13b-instruct.Q4_K_M.gguf',
    description: 'Meta\'s mid-size Code Llama — ideal balance of code writing capability and memory footprint.',
    ramRequired: '16 GB RAM',
    vramRequired: '8 GB VRAM'
  },

  // ── MICROSOFT (PHI) ──────────────────────────────────────────────────────
  {
    id: 'phi-3-mini-instruct',
    name: 'Phi-3.1 Mini Instruct (Q4_K_M)',
    provider: 'microsoft',
    paramCount: '3.8B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '2.4 GB',
    url: 'https://huggingface.co/bartowski/Phi-3.1-mini-128k-instruct-GGUF/resolve/main/Phi-3.1-mini-128k-instruct-Q4_K_M.gguf',
    fileName: 'Phi-3.1-mini-128k-instruct-Q4_K_M.gguf',
    description: 'Microsoft\'s Phi-3.1 Mini 128K context model. Highly optimized small language model with outstanding logic.',
    ramRequired: '6 GB RAM',
    vramRequired: '4 GB VRAM'
  },
  {
    id: 'phi-4-mini-instruct',
    name: 'Phi-4 Mini Instruct (Q4_K_M)',
    provider: 'microsoft',
    paramCount: '3.8B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '2.5 GB',
    url: 'https://huggingface.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF/resolve/main/microsoft_Phi-4-mini-instruct-Q4_K_M.gguf',
    fileName: 'microsoft_Phi-4-mini-instruct-Q4_K_M.gguf',
    description: 'Microsoft\'s Phi-4 Mini — punches well above its weight with exceptional math and coding capabilities.',
    ramRequired: '4 GB RAM',
    vramRequired: '3 GB VRAM',
    featured: true
  },
  {
    id: 'phi-4-instruct',
    name: 'Phi-4 Instruct (Q4_K_M)',
    provider: 'microsoft',
    paramCount: '14B',
    quantization: 'Q4_K_M',
    contextLength: '16K',
    size: '8.4 GB',
    url: 'https://huggingface.co/bartowski/phi-4-GGUF/resolve/main/phi-4-Q4_K_M.gguf',
    fileName: 'phi-4-Q4_K_M.gguf',
    description: 'Microsoft\'s Phi-4 full model — state-of-the-art STEM reasoning and coding in the 14B class.',
    ramRequired: '12 GB RAM',
    vramRequired: '8 GB VRAM'
  },

  // ── ALIBABA (QWEN) ───────────────────────────────────────────────────────
  {
    id: 'qwen2.5-1.5b-instruct',
    name: 'Qwen 2.5 1.5B Instruct (Q4_K_M)',
    provider: 'qwen',
    paramCount: '1.5B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '1.2 GB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    description: 'Lightweight Qwen 2.5 model, excellent for low-latency tasks and resource-constrained systems.',
    ramRequired: '2 GB RAM',
    vramRequired: '1 GB VRAM'
  },
  {
    id: 'qwen2.5-coder-1.5b-native',
    name: 'Qwen 2.5 Coder 1.5B (Q4_K_M)',
    provider: 'qwen',
    paramCount: '1.5B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '1.2 GB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    description: 'Fast, lightweight Qwen model purpose-built for coding. Runs on virtually any device.',
    ramRequired: '2 GB RAM',
    vramRequired: '1 GB VRAM'
  },
  {
    id: 'qwen2.5-coder-3b-native',
    name: 'Qwen 2.5 Coder 3B (Q4_K_M)',
    provider: 'qwen',
    paramCount: '3B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '2.2 GB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-coder-3b-instruct-q4_k_m.gguf',
    description: 'The best 3B code specialist — outperforms models twice its size on competitive coding benchmarks.',
    ramRequired: '4 GB RAM',
    vramRequired: '2 GB VRAM',
    featured: true
  },
  {
    id: 'qwen2.5-coder-7b-native',
    name: 'Qwen 2.5 Coder 7B (Q4_K_M)',
    provider: 'qwen',
    paramCount: '7B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '4.7 GB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
    description: 'Qwen\'s flagship 7B code model — one of the strongest open-source code models available.',
    ramRequired: '8 GB RAM',
    vramRequired: '6 GB VRAM'
  },
  {
    id: 'qwen2.5-coder-14b-native',
    name: 'Qwen 2.5 Coder 14B (Q4_K_M)',
    provider: 'qwen',
    paramCount: '14B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '9.6 GB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-14B-Instruct-GGUF/resolve/main/qwen2.5-coder-14b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-coder-14b-instruct-q4_k_m.gguf',
    description: 'Powerful 14B code model with immense codebase synthesis capabilities.',
    ramRequired: '16 GB RAM',
    vramRequired: '10 GB VRAM'
  },
  {
    id: 'qwen2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder 32B Instruct (Q4_K_M)',
    provider: 'qwen',
    paramCount: '32B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '20.3 GB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-32B-Instruct-GGUF/resolve/main/qwen2.5-coder-32b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-coder-32b-instruct-q4_k_m.gguf',
    description: 'The flagship open-source coding model from Qwen. Extremely strong code generation and repository understanding.',
    ramRequired: '32 GB RAM',
    vramRequired: '24 GB VRAM'
  },
  {
    id: 'qwen2.5-7b-native',
    name: 'Qwen 2.5 7B Instruct (Q4_K_M)',
    provider: 'qwen',
    paramCount: '7B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '4.7 GB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-7b-instruct-q4_k_m.gguf',
    description: 'Versatile Qwen 2.5 general model — excellent at multilingual tasks, analysis, and long-context comprehension.',
    ramRequired: '8 GB RAM',
    vramRequired: '6 GB VRAM'
  },
  {
    id: 'qwen3-8b-native',
    name: 'Qwen 3 8B (Q4_K_M)',
    provider: 'qwen',
    paramCount: '8B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '5.2 GB',
    url: 'https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/qwen3-8b-q4_k_m.gguf',
    fileName: 'qwen3-8b-q4_k_m.gguf',
    description: 'Qwen 3 8B — Alibaba\'s latest generation model with enhanced reasoning and instruction following.',
    ramRequired: '8 GB RAM',
    vramRequired: '6 GB VRAM'
  },

  // ── DEEPSEEK ─────────────────────────────────────────────────────────────
  {
    id: 'deepseek-r1-distill-qwen-1.5b',
    name: 'DeepSeek R1 Distill Qwen 1.5B (Q4_K_M)',
    provider: 'deepseek',
    paramCount: '1.5B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '1.1 GB',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
    fileName: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
    description: 'DeepSeek R1\'s chain-of-thought reasoning distilled into a tiny 1.5B model. Remarkable reasoning at tiny scale.',
    ramRequired: '2 GB RAM',
    vramRequired: '1 GB VRAM',
    featured: true
  },
  {
    id: 'deepseek-r1-distill-qwen-7b',
    name: 'DeepSeek R1 Distill Qwen 7B (Q4_K_M)',
    provider: 'deepseek',
    paramCount: '7B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '4.7 GB',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
    fileName: 'DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
    description: 'DeepSeek R1 reasoning distilled into 7B — solves complex math, logic and code with visible chain-of-thought.',
    ramRequired: '8 GB RAM',
    vramRequired: '6 GB VRAM'
  },
  {
    id: 'deepseek-r1-distill-qwen-14b',
    name: 'DeepSeek R1 Distill Qwen 14B (Q4_K_M)',
    provider: 'deepseek',
    paramCount: '14B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '9.0 GB',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-14B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf',
    fileName: 'DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf',
    description: 'DeepSeek R1 reasoning model distilled into Qwen 14B. Outstanding reasoning and STEM logic for high-end devices.',
    ramRequired: '16 GB RAM',
    vramRequired: '10 GB VRAM'
  },
  {
    id: 'deepseek-r1-distill-llama-8b',
    name: 'DeepSeek R1 Distill Llama 8B (Q4_K_M)',
    provider: 'deepseek',
    paramCount: '8B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '4.9 GB',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf',
    fileName: 'DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf',
    description: 'DeepSeek\'s R1 reasoning transferred into Llama architecture — the best open reasoning model for 8 GB machines.',
    ramRequired: '8 GB RAM',
    vramRequired: '6 GB VRAM'
  },
  {
    id: 'deepseek-r1-distill-qwen-32b',
    name: 'DeepSeek R1 Distill Qwen 32B (Q4_K_M)',
    provider: 'deepseek',
    paramCount: '32B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '20.2 GB',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf',
    fileName: 'DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf',
    description: 'Flagship distilled reasoning model in the 32B class. Top reasoning depth.',
    ramRequired: '32 GB RAM',
    vramRequired: '24 GB VRAM'
  },
  {
    id: 'deepseek-r1-distill-llama-70b',
    name: 'DeepSeek R1 Distill Llama 70B (Q4_K_M)',
    provider: 'deepseek',
    paramCount: '70B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '42.5 GB',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Llama-70B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-70B-Q4_K_M.gguf',
    fileName: 'DeepSeek-R1-Distill-Llama-70B-Q4_K_M.gguf',
    description: 'DeepSeek R1 reasoning distilled into Meta\'s Llama 70B. Superb reasoning, logic, and coding performance.',
    ramRequired: '48 GB RAM',
    vramRequired: '24 GB VRAM'
  },

  // ── MISTRAL ──────────────────────────────────────────────────────────────
  {
    id: 'mistral-7b-v0.3',
    name: 'Mistral 7B v0.3 Instruct (Q4_K_M)',
    provider: 'mistral',
    paramCount: '7B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '4.4 GB',
    url: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
    fileName: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
    description: 'The gold-standard 7B open model. Mistral 7B set the benchmark for what small models could do.',
    ramRequired: '6 GB RAM',
    vramRequired: '4 GB VRAM',
    featured: true
  },
  {
    id: 'mixtral-8x7b-instruct',
    name: 'Mixtral 8×7B Instruct (Q2_K)',
    provider: 'mistral',
    paramCount: '46.7B (MoE)',
    quantization: 'Q2_K',
    contextLength: '32K',
    size: '19.4 GB',
    url: 'https://huggingface.co/TheBloke/Mixtral-8x7B-Instruct-v0.1-GGUF/resolve/main/mixtral-8x7b-instruct-v0.1.Q2_K.gguf',
    fileName: 'mixtral-8x7b-instruct-v0.1.Q2_K.gguf',
    description: 'The classic Mixture of Experts from Mistral. High quality, light footprint quantization.',
    ramRequired: '24 GB RAM',
    vramRequired: '16 GB VRAM'
  },
  {
    id: 'codestral-22b',
    name: 'Codestral 22B Instruct (Q4_K_M)',
    provider: 'mistral',
    paramCount: '22B',
    quantization: 'Q4_K_M',
    contextLength: '32K',
    size: '13.5 GB',
    url: 'https://huggingface.co/bartowski/Codestral-22B-v0.1-GGUF/resolve/main/Codestral-22B-v0.1-Q4_K_M.gguf',
    fileName: 'Codestral-22B-v0.1-Q4_K_M.gguf',
    description: 'Mistral\'s specialized code intelligence model. Superior multi-lingual coding reasoning.',
    ramRequired: '24 GB RAM',
    vramRequired: '16 GB VRAM'
  },
  {
    id: 'mixtral-8x22b-instruct',
    name: 'Mixtral 8×22B Instruct (Q2_K)',
    provider: 'mistral',
    paramCount: '141B (MoE)',
    quantization: 'Q2_K',
    contextLength: '64K',
    size: '48.3 GB',
    url: 'https://huggingface.co/bartowski/Mixtral-8x22B-Instruct-v0.1-GGUF/resolve/main/Mixtral-8x22B-Instruct-v0.1-Q2_K.gguf',
    fileName: 'Mixtral-8x22B-Instruct-v0.1-Q2_K.gguf',
    description: 'Mistral\'s flagship MoE model. Massive capacity for multi-lingual and coding workflows.',
    ramRequired: '64 GB RAM',
    vramRequired: '48 GB VRAM'
  },

  // ── COHERE ───────────────────────────────────────────────────────────────
  {
    id: 'command-r-35b',
    name: 'Command R 35B (Q4_K_M)',
    provider: 'cohere',
    paramCount: '35B',
    quantization: 'Q4_K_M',
    contextLength: '128K',
    size: '20.5 GB',
    url: 'https://huggingface.co/pmccargo/c4ai-command-r-v01-GGUF/resolve/main/c4ai-command-r-v01-q4_k_m.gguf',
    fileName: 'c4ai-command-r-v01-q4_k_m.gguf',
    description: 'Cohere\'s highly acclaimed 35B model designed specifically for complex RAG tasks and multilingual agentic reasoning.',
    ramRequired: '32 GB RAM',
    vramRequired: '24 GB VRAM'
  },
  {
    id: 'command-r-plus-104b',
    name: 'Command R+ 104B (Q2_K)',
    provider: 'cohere',
    paramCount: '104B',
    quantization: 'Q2_K',
    contextLength: '128K',
    size: '38.2 GB',
    url: 'https://huggingface.co/pmccargo/c4ai-command-r-plus-GGUF/resolve/main/c4ai-command-r-plus-q2_k.gguf',
    fileName: 'c4ai-command-r-plus-q2_k.gguf',
    description: 'Cohere\'s state-of-the-art 104B parameter model for complex, high-throughput RAG and tool workflows.',
    ramRequired: '48 GB RAM',
    vramRequired: '32 GB VRAM'
  },

  // ── OPENCHAT / COMMUNITY ─────────────────────────────────────────────────
  {
    id: 'openchat-3.5-7b',
    name: 'OpenChat 3.5 7B (Q4_K_M)',
    provider: 'openchat',
    paramCount: '7B',
    quantization: 'Q4_K_M',
    contextLength: '8K',
    size: '4.4 GB',
    url: 'https://huggingface.co/TheBloke/openchat_3.5-GGUF/resolve/main/openchat_3.5.Q4_K_M.gguf',
    fileName: 'openchat_3.5.Q4_K_M.gguf',
    description: 'OpenChat 3.5 — breakthrough fine-tune that outperformed ChatGPT-3.5 on many benchmarks when released.',
    ramRequired: '6 GB RAM',
    vramRequired: '4 GB VRAM'
  }
];

export interface DownloadProgress {
  modelId: string;
  status: 'idle' | 'downloading' | 'paused' | 'completed' | 'failed';
  bytesDownloaded: number;
  totalBytes: number;
  progressPercentage: number;
  speedMbps: number;
  error?: string;
  message?: string;
}

import { MODELS_DIR as BASE_DIR } from '../../lib/paths.ts';
const MODELS_DIR = path.join(BASE_DIR, 'models');
const STATE_FILE = path.join(BASE_DIR, 'downloads.json');

// Ensure directories exist
if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

// Active downloads map
const activeDownloads = new Map<string, DownloadProgress>();
// Active HTTP request handles (for pause/cancel)
const activeRequests = new Map<string, ClientRequest>();
let downloadStates: Record<string, 'idle' | 'downloading' | 'paused' | 'completed' | 'failed'> = {};

// Load states from disk if exists
try {
  if (fs.existsSync(STATE_FILE)) {
    downloadStates = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    // Sanitize stale states on startup:
    // - 'downloading' → 'paused'  (server restarted mid-download, .part file is intact)
    // - 'failed'      → 'idle'    (allow the user to retry)
    let sanitized = false;
    for (const [modelId, state] of Object.entries(downloadStates)) {
      if (state === 'downloading') {
        downloadStates[modelId] = 'paused';
        sanitized = true;
        logger.info({ modelId }, 'Stale downloading state reset to paused on startup');
      } else if (state === 'failed') {
        downloadStates[modelId] = 'idle';
        sanitized = true;
        logger.info({ modelId }, 'Stale failed state reset to idle on startup');
      }
    }
    if (sanitized) saveStates();
  }
} catch (e) {
  logger.error({ err: e }, 'Error loading model download state file');
}

function saveStates() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(downloadStates, null, 2), 'utf8');
  } catch (e) {
    logger.error({ err: e }, 'Error saving model download state file');
  }
}

export const LocalModelManager = {
  getModelsDir() {
    return MODELS_DIR;
  },

  getPresets() {
    return MODEL_PRESETS;
  },

  listModels() {
    const scannedPresets: ModelPreset[] = [...MODEL_PRESETS];
    try {
      if (fs.existsSync(MODELS_DIR)) {
        const files = fs.readdirSync(MODELS_DIR);
        const presetFileNames = new Set(MODEL_PRESETS.map(p => p.fileName.toLowerCase()));
        
        for (const file of files) {
          if (file.toLowerCase().endsWith('.gguf') && !presetFileNames.has(file.toLowerCase())) {
            const stats = fs.statSync(path.join(MODELS_DIR, file));
            const sizeInGb = stats.size / (1024 * 1024 * 1024);
            const sizeStr = sizeInGb >= 1 
              ? `${sizeInGb.toFixed(1)} GB` 
              : `${(stats.size / (1024 * 1024)).toFixed(0)} MB`;
            
            const qMatch = file.match(/(Q[0-9]+_[A-Z0-9_]+|IQ[0-9]+_[A-Z0-9_]+)/i);
            const quant = qMatch ? qMatch[1].toUpperCase() : 'Custom';
            
            let cleanName = file.replace(/\.gguf$/i, '').replace(/[-_]/g, ' ');
            cleanName = cleanName.replace(/\b\w/g, c => c.toUpperCase());

            const id = `custom-${file.toLowerCase().replace(/[^a-z0-9.-]/g, '-')}`;

            if (!scannedPresets.some(p => p.id === id)) {
              scannedPresets.push({
                id,
                name: cleanName,
                provider: 'community',
                size: sizeStr,
                url: '',
                fileName: file,
                description: 'Custom GGUF model imported directly from local models directory.',
                ramRequired: `${Math.ceil(Math.max(4, sizeInGb * 1.5))} GB RAM`,
                vramRequired: `${Math.ceil(Math.max(2, sizeInGb * 1.1))} GB VRAM`,
                paramCount: 'Custom',
                quantization: quant,
                contextLength: '8K'
              });
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error scanning local model directory');
    }

    return scannedPresets.map(preset => {
      const filePath = path.join(MODELS_DIR, preset.fileName);
      let exists = false;
      let fileSizeBytes = 0;
      let status: 'idle' | 'downloading' | 'paused' | 'completed' | 'failed' = 'idle';

      exists = fs.existsSync(filePath);
      if (exists) {
        try {
          fileSizeBytes = fs.statSync(filePath).size;
          if (fileSizeBytes < 10 * 1024 * 1024) { // Under 10MB is definitely corrupt for these models
            logger.warn({ modelName: preset.name, fileSizeBytes }, 'Model is corrupt. Deleting and recovering...');
            fs.unlinkSync(filePath);
            exists = false;
            fileSizeBytes = 0;
          }
        } catch {
          exists = false;
        }
      }

      const partPath = filePath + '.part';
      const partExists = fs.existsSync(partPath);

      if (exists) {
        status = 'completed';
        if (downloadStates[preset.id] !== 'completed') {
          downloadStates[preset.id] = 'completed';
          saveStates();
        }
      } else if (activeDownloads.has(preset.id)) {
        status = activeDownloads.get(preset.id)!.status;
      } else if (downloadStates[preset.id] === 'completed') {
        // GGUF was deleted manually — reset to idle
        downloadStates[preset.id] = 'idle';
        status = 'idle';
        saveStates();
      } else if (downloadStates[preset.id] === 'paused') {
        if (partExists) {
          status = 'paused';
        } else {
          // Part file deleted manually — reset to idle
          downloadStates[preset.id] = 'idle';
          status = 'idle';
          saveStates();
        }
      } else if (downloadStates[preset.id]) {
        if (downloadStates[preset.id] === 'downloading') {
          downloadStates[preset.id] = 'idle';
          status = 'idle';
          saveStates();
        } else {
          status = downloadStates[preset.id] as any;
        }
      }

      const activeProgress = activeDownloads.get(preset.id);

      return {
        ...preset,
        status,
        filePath: exists ? filePath : null,
        fileSizeBytes,
        progress: activeProgress || {
          modelId: preset.id,
          status,
          bytesDownloaded: exists ? fileSizeBytes : 0,
          totalBytes: exists ? fileSizeBytes : 0,
          progressPercentage: exists ? 100 : 0,
          speedMbps: 0
        }
      };
    });
  },

  getProgress(modelId: string): DownloadProgress {
    const active = activeDownloads.get(modelId);
    if (active) return active;

    const list = this.listModels();
    const preset = list.find(p => p.id === modelId);
    if (!preset) {
      return { modelId, status: 'failed', bytesDownloaded: 0, totalBytes: 0, progressPercentage: 0, speedMbps: 0, error: 'Model preset or custom download not found' };
    }

    const filePath = path.join(MODELS_DIR, preset.fileName);
    const exists = fs.existsSync(filePath);

    return {
      modelId,
      status: exists ? 'completed' : 'idle',
      bytesDownloaded: exists ? preset.fileSizeBytes : 0,
      totalBytes: exists ? preset.fileSizeBytes : 0,
      progressPercentage: exists ? 100 : 0,
      speedMbps: 0
    };
  },

  startDownload(modelId: string) {
    let preset = this.listModels().find(p => p.id === modelId);
    if (!preset) {
      // Check if it is a valid HTTP/HTTPS URL
      if (modelId.startsWith('http://') || modelId.startsWith('https://')) {
        let urlStr = modelId;
        if (urlStr.includes('huggingface.co') && urlStr.includes('/blob/')) {
          urlStr = urlStr.replace('/blob/', '/resolve/');
        }
        const parsedUrl = new URL(urlStr);
        let fileName = path.basename(parsedUrl.pathname);
        if (!fileName.endsWith('.gguf')) {
          fileName = 'custom-model.gguf';
        }
        const customId = `custom-${fileName.toLowerCase().replace(/[^a-z0-9.-]/g, '-')}`;
        
        // Construct the preset dynamically
        const newPreset: ModelPreset = {
          id: customId,
          name: fileName.replace(/\.gguf$/i, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          provider: 'community',
          size: 'Unknown',
          url: urlStr,
          fileName,
          description: `Custom model downloaded from URL: ${parsedUrl.hostname}`,
          ramRequired: '8 GB RAM',
          vramRequired: '4 GB VRAM',
          paramCount: 'Custom',
          quantization: 'Custom',
          contextLength: '8K'
        };
        // Add to active presets array
        MODEL_PRESETS.push(newPreset);
        preset = newPreset as any;
        modelId = customId; // Use the parsed custom ID
      } else {
        throw new Error(`Model preset or URL '${modelId}' not found.`);
      }
    }

    const activePreset = preset!;
    const filePath = path.join(MODELS_DIR, activePreset.fileName);
    
    if (fs.existsSync(filePath)) {
      return { status: 'completed', message: 'Model already downloaded.' };
    }

    if (activeDownloads.has(modelId) && activeDownloads.get(modelId)!.status === 'downloading') {
      return { status: 'downloading', message: 'Download is already in progress.' };
    }

    // Restore paused byte count for accurate progress display
    const partPath = path.join(MODELS_DIR, activePreset.fileName) + '.part';
    let resumedBytes = 0;
    if (fs.existsSync(partPath)) {
      try { resumedBytes = fs.statSync(partPath).size; } catch {}
    }

    const progress: DownloadProgress = {
      modelId,
      status: 'downloading',
      bytesDownloaded: resumedBytes,
      totalBytes: 0,
      progressPercentage: 0,
      speedMbps: 0
    };

    activeDownloads.set(modelId, progress);
    downloadStates[modelId] = 'downloading';
    saveStates();

    this.downloadFile(activePreset.url, filePath, progress).then(() => {
      // If the promise resolved due to a deliberate pause or cancel, don't mark as completed
      if (progress.status === 'paused' || progress.status === 'failed') {
        return;
      }
      progress.status = 'completed';
      progress.progressPercentage = 100;
      activeDownloads.delete(modelId);
      downloadStates[modelId] = 'completed';
      saveStates();
      logger.info({ modelName: activePreset.name, filePath }, 'Successfully downloaded local model');
    }).catch((err) => {
      // Don't clobber a deliberate cancel/pause state
      if (progress.status === 'paused' || progress.status === 'failed') {
        return;
      }
      progress.status = 'failed';
      progress.error = err.message || 'Download failed';
      activeDownloads.delete(modelId);
      downloadStates[modelId] = 'failed';
      saveStates();
      logger.error({ err, modelName: preset!.name }, 'Failed to download local model');
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    });

    return { status: 'downloading', message: 'Download started.', modelId };
  },

  pauseDownload(modelId: string): { status: string; message: string } {
    const progress = activeDownloads.get(modelId);
    if (!progress || progress.status !== 'downloading') {
      return { status: 'error', message: 'No active download found for this model.' };
    }

    // Set paused BEFORE destroying so the async error handler sees the right state
    progress.status = 'paused';
    progress.speedMbps = 0;
    downloadStates[modelId] = 'paused';
    saveStates();

    // Now destroy the TCP connection — .part file is kept intact for resume
    const req = activeRequests.get(modelId);
    if (req) {
      req.destroy();
      activeRequests.delete(modelId);
    }

    logger.info({ modelId }, 'Download paused by user');
    return { status: 'paused', message: 'Download paused. Resume to continue from where it stopped.' };
  },

  resumeDownload(modelId: string): { status: string; message: string; modelId?: string } {
    const progress = activeDownloads.get(modelId);
    if (!progress || progress.status !== 'paused') {
      // Not currently tracked as paused — just try a fresh startDownload
      return this.startDownload(modelId) as any;
    }

    // Mark as downloading again and call startDownload which resumes via HTTP Range
    activeDownloads.delete(modelId); // Clear so startDownload re-creates it cleanly
    downloadStates[modelId] = 'idle'; // Temporarily reset so startDownload doesn't bail out
    logger.info({ modelId }, 'Resuming paused download');
    return this.startDownload(modelId) as any;
  },

  cancelDownload(modelId: string): { status: string; message: string } {
    const progress = activeDownloads.get(modelId);

    // Mark as failed BEFORE destroying so .then()/.catch() guards see the cancelled state
    if (progress) {
      progress.status = 'failed';
      progress.error = 'Cancelled by user';
    }

    // Now destroy active request
    const req = activeRequests.get(modelId);
    if (req) {
      req.destroy();
      activeRequests.delete(modelId);
    }

    if (progress) {
      activeDownloads.delete(modelId);
    }

    downloadStates[modelId] = 'idle';
    saveStates();

    // Delete the partial file
    const preset = MODEL_PRESETS.find(p => p.id === modelId);
    if (preset) {
      const partPath = path.join(MODELS_DIR, preset.fileName) + '.part';
      if (fs.existsSync(partPath)) {
        try { fs.unlinkSync(partPath); } catch {}
      }
    }

    logger.info({ modelId }, 'Download cancelled by user');
    return { status: 'cancelled', message: 'Download cancelled and partial file removed.' };
  },

  /**
   * Delete a downloaded GGUF model file from disk and reset its state to idle.
   * Returns true on success, throws on error.
   */
  deleteModel(modelId: string): { deleted: boolean; message: string } {
    const preset = this.listModels().find(p => p.id === modelId);
    if (!preset) {
      throw new Error(`Model '${modelId}' not found.`);
    }

    // Cancel any active download for this model first
    if (activeDownloads.has(modelId)) {
      const prog = activeDownloads.get(modelId)!;
      prog.status = 'failed';
      prog.error = 'Deleted by user';
      activeDownloads.delete(modelId);
    }

    let deleted = false;
    const filePath = path.join(MODELS_DIR, preset.fileName);
    const partPath = filePath + '.part';

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      deleted = true;
    }

    if (fs.existsSync(partPath)) {
      try { fs.unlinkSync(partPath); } catch {}
    }

    downloadStates[modelId] = 'idle';
    saveStates();

    return { deleted, message: deleted ? `${preset.name} deleted from disk.` : 'No file found on disk, state reset.' };
  },

  downloadFile(url: string, destPath: string, progress: DownloadProgress): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const partPath = destPath + '.part';
      let fileStream: fs.WriteStream | null = null;
      let existingBytes = 0;

      if (fs.existsSync(partPath)) {
        try {
          existingBytes = fs.statSync(partPath).size;
        } catch (e) {
          existingBytes = 0;
        }
      }

      let receivedBytes = existingBytes;
      let totalBytes = 0;
      let lastTime = Date.now();
      let lastBytes = existingBytes;
      let settled = false;

      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (err) reject(err); else resolve();
      };

      const makeRequest = (currentUrl: string) => {
        // If already paused/cancelled before the request fires, bail immediately
        if (progress.status === 'paused' || progress.status === 'failed') {
          done();
          return;
        }

        const urlObj = new URL(currentUrl);
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Connection': 'keep-alive'
        };

        if (existingBytes > 0) {
          headers['Range'] = `bytes=${existingBytes}-`;
        }

        const req = https.get(urlObj, { headers }, (res: IncomingMessage) => {
          // Handle redirects — consume response and follow
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
            res.resume(); // drain and discard redirect body so socket is freed
            let redirectUrl = res.headers.location;
            if (redirectUrl) {
              if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
                redirectUrl = new URL(redirectUrl, currentUrl).href;
              }
              activeRequests.delete(progress.modelId); // clear stale ref before new request
              makeRequest(redirectUrl!);
              return;
            }
          }

          const isRangeSupported = res.statusCode === 206;

          if (res.statusCode !== 200 && res.statusCode !== 206) {
            res.resume();
            done(new Error(`Server responded with status code: ${res.statusCode}`));
            return;
          }

          const contentLength = parseInt(res.headers['content-length'] || '0', 10);

          if (isRangeSupported) {
            totalBytes = contentLength + existingBytes;
          } else {
            totalBytes = contentLength;
            receivedBytes = 0;
            existingBytes = 0;
            lastBytes = 0;
          }

          progress.totalBytes = totalBytes;

          try {
            fileStream = fs.createWriteStream(partPath, { flags: isRangeSupported ? 'a' : 'w' });
          } catch (err: any) {
            done(err);
            return;
          }

          fileStream.on('error', (err) => done(err));

          res.on('data', (chunk) => {
            receivedBytes += chunk.length;
            progress.bytesDownloaded = receivedBytes;

            if (totalBytes > 0) {
              progress.progressPercentage = Math.round((receivedBytes / totalBytes) * 100);
            }

            const now = Date.now();
            const elapsed = now - lastTime;
            if (elapsed >= 500) {
              const bytesDiff = receivedBytes - lastBytes;
              progress.speedMbps = parseFloat(((bytesDiff / elapsed) * 1000 / (1024 * 1024)).toFixed(2));
              lastTime = now;
              lastBytes = receivedBytes;
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            if (fileStream) {
              fileStream.close(() => {
                activeRequests.delete(progress.modelId);
                // If paused/cancelled while finishing, leave the .part file intact
                if (progress.status === 'paused' || progress.status === 'failed') {
                  done();
                  return;
                }
                try {
                  fs.renameSync(partPath, destPath);
                  done();
                } catch (e: any) {
                  done(e);
                }
              });
            }
          });
        });

        // Register active request for pause/cancel
        activeRequests.set(progress.modelId, req);

        req.on('error', (err) => {
          activeRequests.delete(progress.modelId);
          if (fileStream) fileStream.destroy();
          // Deliberate pause or cancel — resolve silently, .part file stays
          if (progress.status === 'paused' || progress.status === 'failed') {
            done();
            return;
          }
          done(err);
        });

        req.setTimeout(600000, () => {
          req.destroy();
          if (fileStream) fileStream.destroy();
          if (progress.status === 'paused' || progress.status === 'failed') { done(); return; }
          done(new Error('Download timeout reached. Connection lost.'));
        });
      };

      makeRequest(url);
    });
  },

  async getDeviceCompatibility(): Promise<{
    specs: {
      totalRamBytes: number;
      totalRamGB: number;
      logicalCores: number;
      cpuModel: string;
      gpus: { vendor: string; model: string; vramBytes: number; isDiscrete: boolean }[];
      maxVramBytes: number;
      maxVramGB: number;
      hasDiscreteGPU: boolean;
      platform: string;
    };
    recommendedModelId: string;
    allCompatibleModelIds: string[];
    presetsCompatibility: Array<{
      modelId: string;
      modelName: string;
      isCompatible: boolean;
      totalLayers: number;
      gpuLayers: number;
      cpuLayers: number;
      offloadRatio: number;
      estimatedRamUsageGB: number;
      estimatedVramUsageGB: number;
      recommendedThreads: number;
      speedClass: 'fast' | 'moderate' | 'slow';
      reason: string;
    }>;
  }> {
    const totalRamBytes = os.totalmem();
    const totalRamGB = Math.round(totalRamBytes / (1024 * 1024 * 1024));
    const platform = os.platform();
    const logicalCores = os.cpus().length;
    const cpuModel = os.cpus()[0]?.model || 'Unknown';
    
    let gpusList: any[] = [];
    let maxVramBytes = 0;
    let hasDiscreteGPU = false;

    try {
      const graphics = await si.graphics();
      if (graphics && graphics.controllers) {
        gpusList = graphics.controllers.map((g) => {
          let vramMB = g.vram || g.memoryTotal || 0;
          if (typeof vramMB !== 'number' || isNaN(vramMB) || vramMB < 0) {
            vramMB = 0;
          }
          
          const modelLower = (g.model || '').toLowerCase();
          const vendorLower = (g.vendor || '').toLowerCase();
          const isDiscrete = modelLower.includes('geforce') || modelLower.includes('rtx') || modelLower.includes('gtx') || modelLower.includes('radeon') || vendorLower.includes('nvidia') || vendorLower.includes('amd');
          
          if (vramMB === 0 && isDiscrete) {
            vramMB = 4096; // Fallback
          }

          const vramBytes = vramMB * 1024 * 1024;
          if (isDiscrete) {
            hasDiscreteGPU = true;
          }
          if (vramBytes > maxVramBytes) {
            maxVramBytes = vramBytes;
          }

          return {
            vendor: g.vendor || 'Unknown',
            model: g.model || 'Unknown',
            vramBytes,
            isDiscrete
          };
        });
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to query systeminformation graphics');
    }

    // Try purely fallback on nvidia-smi if systeminformation graphics is empty
    if (gpusList.length === 0) {
      try {
        const freeNvidiaBytes = await new Promise<number>((resolve) => {
          const commands = [
            'nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits',
            '"C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe" --query-gpu=memory.free --format=csv,noheader,nounits'
          ];
          const tryExec = (idx: number) => {
            if (idx >= commands.length) { resolve(0); return; }
            const { exec } = require('child_process');
            exec(commands[idx], (error: any, stdout: string) => {
              if (error) { tryExec(idx + 1); }
              else {
                const mem = parseInt(stdout.trim(), 10);
                resolve(isNaN(mem) ? 0 : mem * 1024 * 1024);
              }
            });
          };
          tryExec(0);
        });
        if (freeNvidiaBytes > 0) {
          const vramBytes = freeNvidiaBytes + (750 * 1024 * 1024);
          maxVramBytes = vramBytes;
          hasDiscreteGPU = true;
          gpusList.push({
            vendor: 'NVIDIA',
            model: 'GeForce Dedicated GPU',
            vramBytes,
            isDiscrete: true
          });
        }
      } catch {}
    }

    const maxVramGB = Math.round(maxVramBytes / (1024 * 1024 * 1024));

    // compatibility filter logic
    const allCompatibleModelIds: string[] = [];
    for (const preset of MODEL_PRESETS) {
      const ramReqMatch = preset.ramRequired.match(/^(\d+)\s*GB/i);
      const ramReq = ramReqMatch ? parseInt(ramReqMatch[1], 10) : 4;
      const meetsRam = totalRamGB >= ramReq;
      if (meetsRam) {
        allCompatibleModelIds.push(preset.id);
      }
    }

    // presets detailed resource compatibility projections
    const presetsCompatibility = MODEL_PRESETS.map((preset) => {
      const sizeMatch = preset.size.match(/^([\d.]+)\s*(GB|MB)/i);
      let fileSize = 2 * 1024 * 1024 * 1024; // Default 2GB
      if (sizeMatch) {
        const val = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2].toUpperCase();
        fileSize = val * 1024 * 1024 * 1024 * (unit === 'MB' ? 1/1024 : 1);
      }

      let totalLayers = 32;
      const filenameLower = preset.fileName.toLowerCase();
      if (filenameLower.includes('70b') || filenameLower.includes('80l')) totalLayers = 80;
      else if (filenameLower.includes('32b') || filenameLower.includes('35b')) totalLayers = 64;
      else if (filenameLower.includes('14b') || filenameLower.includes('13b') || filenameLower.includes('12b')) totalLayers = 40;
      else if (filenameLower.includes('8b') || filenameLower.includes('9b') || filenameLower.includes('7b')) totalLayers = 32;
      else if (filenameLower.includes('3b') || filenameLower.includes('4b')) totalLayers = 28;
      else if (filenameLower.includes('1.5b') || filenameLower.includes('2b')) totalLayers = 24;

      const ramReqMatch = preset.ramRequired.match(/^(\d+)\s*GB/i);
      const ramReq = ramReqMatch ? parseInt(ramReqMatch[1], 10) : 4;
      const meetsRam = totalRamGB >= ramReq;

      const usableVram = Math.max(0, maxVramBytes - (750 * 1024 * 1024)); // Usable GPU VRAM (excluding 750MB system/display overhead)
      const kvCachePerLayer = 14 * 1024 * 1024; // ~14MB per layer at Q8_0 quant context 2048
      const computeBuffer = 4 * 1024 * 1024; // 4MB compute overhead
      
      const layerSize = (fileSize + (totalLayers * kvCachePerLayer) + computeBuffer) / totalLayers;

      let gpuLayers = 0;
      if (hasDiscreteGPU && usableVram > 0) {
        const fit = Math.floor(usableVram / layerSize);
        gpuLayers = Math.max(0, Math.min(totalLayers, fit));
      }
      const cpuLayers = totalLayers - gpuLayers;
      const offloadRatio = Math.round((gpuLayers / totalLayers) * 100);

      // Estimate loaded RAM/VRAM usage in GB (rounded to 1 decimal)
      let estimatedVramUsageGB = 0;
      if (gpuLayers > 0) {
        const bytes = (gpuLayers / totalLayers) * fileSize + (gpuLayers * kvCachePerLayer) + computeBuffer;
        estimatedVramUsageGB = Math.round((bytes / (1024 * 1024 * 1024)) * 10) / 10;
      }

      const ramBytes = (cpuLayers / totalLayers) * fileSize + (cpuLayers * kvCachePerLayer) + (500 * 1024 * 1024); // Add 500MB baseline system load
      const estimatedRamUsageGB = Math.round((ramBytes / (1024 * 1024 * 1024)) * 10) / 10;

      const recommendedThreads = Math.max(1, Math.floor(logicalCores * 0.75));

      let speedClass: 'fast' | 'moderate' | 'slow' = 'moderate';
      let reason = '';
      
      if (gpuLayers === totalLayers) {
        speedClass = 'fast';
        reason = `100% of model layers offloaded to your discrete GPU VRAM (${estimatedVramUsageGB} GB).`;
      } else if (gpuLayers > 0) {
        speedClass = 'moderate';
        reason = `Hybrid execution: ${gpuLayers}/${totalLayers} layers run in GPU VRAM, remaining ${cpuLayers} layers in CPU RAM.`;
      } else {
        const isSmall = (fileSize / (1024*1024*1024)) < 3.0;
        speedClass = isSmall ? 'moderate' : 'slow';
        reason = isSmall 
          ? `CPU-only execution. The model is lightweight, so speed will be moderate on your ${logicalCores}-core CPU.`
          : `CPU-only execution. The model size (${preset.size}) is heavy and will generate slowly without a dedicated GPU.`;
      }

      if (!meetsRam) {
        reason = `Incompatible. System RAM (${totalRamGB} GB) is less than required (${ramReq} GB).`;
      }

      return {
        modelId: preset.id,
        modelName: preset.name,
        isCompatible: meetsRam,
        totalLayers,
        gpuLayers,
        cpuLayers,
        offloadRatio,
        estimatedRamUsageGB,
        estimatedVramUsageGB,
        recommendedThreads,
        speedClass,
        reason
      };
    });

    let recommendedModelId = 'nyx-gemma-4-e2b-it'; // Perfect general fallback

    if (totalRamGB >= 48 && maxVramGB >= 24) {
      recommendedModelId = 'llama-3.3-70b-native';
    } else if (totalRamGB >= 32 && maxVramGB >= 16) {
      recommendedModelId = 'gemma-3-27b-it';
    } else if (totalRamGB >= 16 && maxVramGB >= 8) {
      recommendedModelId = 'qwen2.5-coder-14b-native';
    } else if (totalRamGB >= 8 && maxVramGB >= 6) {
      recommendedModelId = 'llama-3.1-8b-native'; // The perfect workhorse
    } else if (totalRamGB >= 8 && maxVramGB >= 3) {
      recommendedModelId = 'phi-4-mini-instruct'; // Punchy math/code specialist
    } else if (totalRamGB >= 8) {
      recommendedModelId = 'deepseek-r1-distill-qwen-1.5b'; // Fast reasoning distilled Qwen
    } else {
      recommendedModelId = 'llama-3.2-1b-native'; // Ultra-lightweight
    }

    if (!allCompatibleModelIds.includes(recommendedModelId)) {
      recommendedModelId = allCompatibleModelIds.length > 0 ? allCompatibleModelIds[0] : 'llama-3.2-1b-native';
    }

    return {
      specs: {
        totalRamBytes,
        totalRamGB,
        logicalCores,
        cpuModel,
        gpus: gpusList,
        maxVramBytes,
        maxVramGB,
        hasDiscreteGPU,
        platform
      },
      recommendedModelId,
      allCompatibleModelIds,
      presetsCompatibility
    };
  }
};
