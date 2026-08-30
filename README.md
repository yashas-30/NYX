<div align="center">

<img src="public/nyx-icon.png" alt="NYX Logo" width="80" height="80" />

# NYX

### High-Performance Native Local Intelligence & Multi-Provider AI Environment

[![Version](https://img.shields.io/badge/version-0.5.0-0ea5e9?style=flat-square)](https://github.com/yashas-30/NYX/releases)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-1.75+-CE422B?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)

**NYX** is an AI coding and reasoning environment that blends **local GPU execution** (Vulkan / `llama.cpp`) with **cloud LLM orchestration** (Google Gemini, Groq LPUs, Mistral AI, NVIDIA NIM, and OpenRouter).

Featuring interactive Slidev/PPTX presentations, real-time grounded web search, 39-type visual architecture diagramming, ReAct autonomous agents, and persistent memory in a True Black Minimalist interface.

[**Live Demo**](https://yashas-30.github.io/NYX) · [**Releases**](https://github.com/yashas-30/NYX/releases) · [**Issues**](https://github.com/yashas-30/NYX/issues)

</div>

---

## ⚡ Core Capabilities

| Capability                               | Description                                                                                                                                           |
| :--------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🖥️ **Local GPU Acceleration**            | Built-in Vulkan `llama-server` runner. Execute GGUF models (Llama 3.3, Qwen 2.5, Gemma 3, DeepSeek, Mistral) locally with zero external dependencies. |
| 🌐 **Multi-Provider Cloud Gateway**      | Unified streaming across **Google Gemini**, **Groq LPUs**, **Mistral AI**, **NVIDIA NIM**, and **OpenRouter Free Tier**.                              |
| 📊 **Slidev & PPTX Presentation Engine** | Automatic generation of modular presentations with visual text budgets, drawing canvas, overview grid, and export to PowerPoint (`.pptx`) and PDF.    |
| 🔍 **Grounded Web Search Synthesis**     | Live DuckDuckGo web retrieval with bracketed citations (`[1]`, `[2]`), verified image cards, and YouTube video integration.                           |
| 📐 **39 Visual Architecture Types**      | Editorial HTML/SVG visual diagrams (flowcharts, sequence, C4 models, swimlanes, entity-relationship schemas, timelines) in True Black styling.        |
| 🤖 **Rust ReAct Agent Conductor**        | Multi-step agent loop with native filesystem tools, live command execution, scraping, and real-time execution plan visualization.                     |
| 🧠 **Persistent Vector Memory & RAG**    | Native SQLite connection pooling and TurboVec vector storage for cross-session contextual recall.                                                     |
| 🎨 **True Black Minimalist Design**      | Pure `#000000` canvas, obsidian surface cards (`#09090b` / `#121214`), subtle `border-white/10` borders, and Geist typography.                        |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v20+ or v22+
- **pnpm** v11+ (`npm install -g pnpm`)
- **Rust Toolchain** (optional, for building the native desktop app) — [rustup.rs](https://rustup.rs)
- **Vulkan-capable GPU** (NVIDIA / AMD / Intel, for local model acceleration)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/yashas-30/NYX.git
cd NYX

# Install monorepo dependencies
pnpm install

# Start the Web Application in development mode
pnpm run dev:web

# Or start the Native Desktop Application (Tauri v2)
pnpm run dev:desktop
```

---

## ☁️ Supported Cloud Providers & Models

NYX features a curated, high-throughput model registry categorized by provider:

### 1. Google Gemini

- `gemini-2.5-flash` — High-speed multimodal reasoning
- `gemini-2.5-pro` — Complex reasoning and deep analytical synthesis
- `gemini-2.0-flash` — Ultra-low latency chat & coding

### 2. Groq Cloud (Ultra-Fast LPUs)

- `openai/gpt-oss-120b` — 120B parameter reasoning model running at blazing token rates
- `openai/gpt-oss-20b` — 20B parameter model with 65K max output capacity
- `groq/compound` & `groq/compound-mini` — Agentic tool orchestration models
- `qwen/qwen3.6-27b` — High-throughput multilingual and coding model

### 3. Mistral AI

- `mistral-medium-2505` (Medium 3.5 128B)
- `mistral-small-2503` (Small 4 119B)
- `mistral-large-2411` (Large 3 128B)
- `ministral-8b-2410` & `ministral-3b-2410`
- `codestral-latest` (Codestral 2501 256K Context)
- `ministral-14b-2410`

### 4. NVIDIA NIM

- `nvidia/nemotron-3-super-120b-a12b` & `nvidia/nemotron-3-nano-30b-a3b`
- `nvidia/llama-3.1-nemotron-ultra-253b-v1`
- `meta/llama-3.3-70b-instruct`
- `mistralai/mistral-nemotron` & `mistralai/mistral-large-2-instruct`
- `google/gemma-4-31b-it`
- `minimaxai/minimax-m3`
- `openai/gpt-oss-120b` & `openai/gpt-oss-20b`

### 5. OpenRouter Free Tier

- `nvidia/nemotron-3-super-120b-a12b:free`
- `openai/gpt-oss-20b:free`
- `cohere/north-mini-code:free`
- `google/gemma-4-26b-a4b-it:free` & `google/gemma-4-31b-it:free`
- `inclusionai/ling-3.0-flash:free`
- `nvidia/nemotron-3-nano-30b-a3b:free`
- `nvidia/nemotron-nano-9b-v2:free` & `nvidia/nemotron-nano-12b-v2-vl:free`
- `poolside/laguna-s-2.1:free` & `poolside/laguna-xs-2.1:free`

---

## 🖥️ Local Model Execution Engine

NYX integrates native `llama-server` management with hardware-aware scheduling:

- **Automatic VRAM / RAM Allocation**: Dynamically calculates GPU layer offloading based on detected system hardware.
- **HuggingFace Hub Explorer**: Search and download GGUF models directly within the app.
- **Per-Model Fine Controls**:
  - **GPU Offload (ngl)**: 0 (CPU only) → 99 (Full VRAM)
  - **Context Window**: 512 → 131,072 tokens
  - **Sampling**: Temperature, Top-P, Top-K, Repeat Penalty, and Mirostat v1/v2
  - **Compute Threads & Batch Size**: Fine-tune CPU concurrency for optimal throughput

---

## 🏛️ Architecture & Monorepo Structure

```
NYX/
├── apps/
│   ├── web/                     # React 19 + Vite + Tailwind v4 frontend
│   │   ├── src/core/prompts/    # Modular prompt routing (Slidev, Search, Diagrams, Code, Research)
│   │   ├── src/features/chat/   # Smooth streaming chat, typewriter, lightbox, video cards
│   │   ├── src/features/presentation/ # Slidev parser, interactive deck, PPTX exporter
│   │   └── src/features/agents/ # Plan visualizer & execution monitors
│   └── desktop/                 # Tauri v2 desktop shell
│
├── packages/
│   ├── shared/                  # Shared model definitions, Zod schemas, provider contracts
│   └── config/                  # TypeScript & tooling configurations
│
└── src-tauri/                   # Rust backend (Tauri v2)
    ├── src/llm/providers/       # Gemini, Groq, Mistral, NVIDIA, OpenRouter streaming
    ├── src/llm/local/           # Vulkan llama-server process manager & hardware detection
    ├── src/agents/core/         # ReAct agent loop & execution conductor
    ├── src/agents/tools/        # Native filesystem, web search, media, and sandbox tools
    └── src/rag/                 # SQLite persistence & TurboVec vector embeddings
```

---

## 🧪 Testing & Verification

NYX maintains a strict, domain-agnostic test suite covering both frontend and backend logic:

```bash
# Run all Vitest unit and integration tests
pnpm test

# Run TypeScript typechecks across all monorepo workspaces
pnpm run typecheck

# Verify Rust backend compilation
cd src-tauri && cargo check
```

---

## 🔒 Security & Privacy

- **Client-Side API Key Storage**: API keys are securely stored locally and never proxied through external servers.
- **Automated CodeQL & Dependency Scanning**: Continuous static analysis and weekly vulnerability auditing.
- **Local Isolation**: All local model queries and vector embeddings remain 100% on your machine.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for details.
