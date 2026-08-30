<div align="center">

<img src="public/nyx-icon.png" alt="NYX Logo" width="88" height="88" />

# NYX

### High-Performance Native Local Intelligence & Multi-Provider AI Studio

[![Version](https://img.shields.io/badge/version-0.5.0-0ea5e9?style=flat-square)](https://github.com/yashas-30/NYX/releases)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-1.75+-CE422B?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)

**NYX** is a desktop & web AI operating environment combining **local GPU inference** (`llama.cpp` / Vulkan) with **multi-provider cloud LLM orchestration** (Google Gemini, Groq LPUs, Mistral AI, NVIDIA NIM, and OpenRouter Free Tier).

Built from the ground up for high-fidelity code synthesis, interactive Slidev/PPTX presentations, 39 visual diagram types, real-time grounded web search, and ReAct agent workflows inside an obsidian **True Black Minimalist** interface.

[**Live Demo**](https://yashas-30.github.io/NYX) · [**Releases**](https://github.com/yashas-30/NYX/releases) · [**Issues**](https://github.com/yashas-30/NYX/issues)

</div>

---

## ⚡ Core Pillars

```
                     ┌─────────────────────────────────────────────────────────┐
                     │                       NYX STUDIO                        │
                     └────────────────────────────┬────────────────────────────┘
                                                  │
         ┌────────────────────────────────────────┴────────────────────────────────────────┐
         │                                                                                 │
┌────────▼────────┐                                                               ┌────────▼────────┐
│  LOCAL RUNNER   │                                                               │  CLOUD GATEWAY  │
├─────────────────┤                                                               ├─────────────────┤
│ • Vulkan Engine │                                                               │ • Google Gemini │
│ • GGUF Models   │                                                               │ • Groq LPUs     │
│ • HuggingFace   │                                                               │ • Mistral AI    │
│ • Zero External │                                                               │ • NVIDIA NIM    │
│   Dependencies  │                                                               │ • OpenRouter    │
└─────────────────┘                                                               └─────────────────┘
```

| Engine                            | Highlights                                                                                                                                           |
| :-------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🖥️ **Local GPU Runner**           | Built-in Vulkan `llama-server` runtime. Download and execute GGUF models directly on your GPU without Ollama or external daemons.                    |
| ☁️ **Unified Cloud Gateway**      | High-throughput streaming across **40 curated cloud models** from Gemini, Groq, Mistral, NVIDIA NIM, and OpenRouter.                                 |
| 📊 **Slidev & PPTX Engine**       | Automated generation of modular Slidev presentations with layout text budgets, drawing canvas, overview grid, and PowerPoint (`.pptx`) / PDF export. |
| 📐 **39 Visual Diagram Types**    | Publication-grade inline HTML/SVG diagrams (C4 models, sequence flows, flywheels, ER schemas, swimlanes, timelines) in True Black styling.           |
| 🔍 **Grounded Web Search**        | Real-time DuckDuckGo web retrieval with bracketed inline citations (`[1]`, `[2]`), verified image cards, and YouTube explanation video embeds.       |
| 🤖 **Rust ReAct Conductor**       | Native multi-step agent loop with filesystem I/O, web scraping, live command execution, and real-time execution plan visualization.                  |
| 🧠 **Persistent TurboVec Memory** | Native SQLite connection pooling and vector embeddings for instant semantic search and cross-session memory recall.                                  |
| 🎨 **True Black Minimalist UI**   | Pure `#000000` canvas, obsidian surface cards (`#09090b` / `#121214`), subtle `border-white/10` borders, and Geist typography.                       |

---

## 🌐 Supported Cloud Model Catalog

NYX features an accurate, provider-organized model catalog with complete specs and rate-limit tracking:

### 1. Google Gemini (Google AI Studio)

| Model Name                | Model ID                | Context        | Max Output   | Modality   | Rate Limit      | Capabilities                                     |
| :------------------------ | :---------------------- | :------------- | :----------- | :--------- | :-------------- | :----------------------------------------------- |
| **Gemini 3.7 Flash**      | `gemini-3.7-flash`      | 1M (1,048,576) | 64K (65,536) | Multimodal | 15 RPM / 1M TPM | Hybrid Reasoning, Thinking Budget, Vision, Audio |
| **Gemini 3.6 Flash**      | `gemini-3.6-flash`      | 1M (1,048,576) | 64K (65,536) | Multimodal | 15 RPM / 1M TPM | Fast Single-Pass Inference, Multimodal Vision    |
| **Gemini 3.5 Flash-Lite** | `gemini-3.5-flash-lite` | 1M (1,048,576) | 64K (65,536) | Multimodal | 30 RPM / 4M TPM | High-Throughput Subagent Loops & Batching        |
| **Gemini 3.1 Flash-Lite** | `gemini-3.1-flash-lite` | 1M (1,048,576) | 64K (65,536) | Multimodal | 30 RPM / 4M TPM | Low Latency UI & Fast Summarization              |
| **Gemma 4 31B**           | `gemma-4-31b-it`        | 262K (262,144) | 32K (32,768) | Multimodal | 30 RPM / 4M TPM | Dense Open Model, Vision & Code                  |
| **Gemma 4 26B MoE**       | `gemma-4-26b-a4b-it`    | 262K (262,144) | 32K (32,768) | Multimodal | 30 RPM / 4M TPM | Sparse Mixture-of-Experts (4B Active), Vision    |

---

### 2. Groq Cloud (Ultra-Fast LPU Hardware)

| Model Name             | Model ID              | Context        | Max Output   | Modality | Rate Limit       | Capabilities                                      |
| :--------------------- | :-------------------- | :------------- | :----------- | :------- | :--------------- | :------------------------------------------------ |
| **GPT OSS 120B**       | `openai/gpt-oss-120b` | 131K (131,072) | 65K (65,536) | Text     | 30 RPM / 20K TPM | Flagship 120B Open Reasoning, Deep Thinking       |
| **GPT OSS 20B**        | `openai/gpt-oss-20b`  | 131K (131,072) | 65K (65,536) | Text     | 30 RPM / 20K TPM | 20B Fast Reasoning, 65K Max Output Tokens         |
| **Groq Compound**      | `groq/compound`       | 131K (131,072) | 8K (8,192)   | Text     | 30 RPM / 10K TPM | Multi-Step Agentic Planning, Thinking             |
| **Groq Compound Mini** | `groq/compound-mini`  | 131K (131,072) | 8K (8,192)   | Text     | 30 RPM / 10K TPM | Fast Subagent Intermediate Execution              |
| **Qwen 3.6 27B**       | `qwen/qwen3.6-27b`    | 131K (131,072) | 16K (16,384) | Text     | 30 RPM / 20K TPM | Ultra-High Throughput (~400+ tok/s), Multilingual |

---

### 3. Mistral AI (La Plateforme)

| Model Name                    | Model ID                | Context        | Max Output   | Modality            | Rate Limit        | Capabilities                                 |
| :---------------------------- | :---------------------- | :------------- | :----------- | :------------------ | :---------------- | :------------------------------------------- |
| **Mistral Medium 3.5 (128B)** | `mistral-medium-latest` | 256K (262,144) | 32K (32,768) | Text + Image + Code | 60 RPM / 500K TPM | 128B Multimodal Analysis, Code Generation    |
| **Mistral Small 4**           | `mistral-small-latest`  | 256K (262,144) | 32K (32,768) | Text + Image + Code | 60 RPM / 500K TPM | Efficient Multimodal & Code Generation       |
| **Mistral Large 3**           | `mistral-large-latest`  | 256K (262,144) | 32K (32,768) | Multimodal          | 60 RPM / 500K TPM | Frontier Foundation Reasoning & Multilingual |
| **Ministral 3 8B**            | `ministral-8b-latest`   | 256K (262,144) | 16K (16,384) | Text + Vision       | 60 RPM / 500K TPM | High-Performance Edge Vision Reasoning       |
| **Codestral**                 | `codestral-latest`      | 128K (131,072) | 32K (32,768) | Code                | 60 RPM / 500K TPM | Fill-In-The-Middle (FIM), 80+ Languages      |
| **Ministral 3 3B**            | `ministral-3b-latest`   | 256K (262,144) | 8K (8,192)   | Text + Vision       | 60 RPM / 500K TPM | Ultra-Fast Lightweight Edge Vision Model     |
| **Ministral 3 14B**           | `ministral-14b-latest`  | 256K (262,144) | 16K (16,384) | Text + Vision       | 60 RPM / 500K TPM | Balanced Precision Multimodal Reasoning      |

---

### 4. NVIDIA NIM (Inference Microservices)

| Model Name                        | Model ID                                  | Context        | Max Output     | Modality | Rate Limit       | Capabilities                                    |
| :-------------------------------- | :---------------------------------------- | :------------- | :------------- | :------- | :--------------- | :---------------------------------------------- |
| **Nemotron 3 Super 120B**         | `nvidia/nemotron-3-super-120b-a12b`       | 1M (1,048,576) | 262K (262,144) | Text     | 40 RPM / 10K RPD | 120B MoE Flagship Reasoning, 262K Output        |
| **Nemotron 3 Nano 30B**           | `nvidia/nemotron-3-nano-30b-a3b`          | 262K (262,144) | 32K (32,768)   | Text     | 40 RPM / 10K RPD | 30B MoE Lightweight High Concurrency            |
| **Llama 3.1 Nemotron Ultra 253B** | `nvidia/llama-3.1-nemotron-ultra-253b-v1` | 128K (131,072) | 4K (4,096)     | Text     | 40 RPM / 10K RPD | Ultra-Dense 253B Frontier Reasoning             |
| **Meta Llama 3.3 70B Instruct**   | `meta/llama-3.3-70b-instruct`             | 128K (131,072) | 4K (4,096)     | Text     | 40 RPM / 10K RPD | Open Foundation Llama 3.3 with TensorRT         |
| **Mistral Nemotron**              | `mistralai/mistral-nemotron`              | 128K (131,072) | 8K (8,192)     | Text     | 40 RPM / 10K RPD | Co-Developed High-Throughput Reasoning          |
| **Gemma 4 31B (NVIDIA NIM)**      | `google/gemma-4-31b-it`                   | 262K (262,144) | 8K (8,192)     | Text     | 40 RPM / 10K RPD | 31B Dense Instruction Model with TensorRT       |
| **Mistral Large 2 Instruct**      | `mistralai/mistral-large-2-instruct`      | 128K (131,072) | 4K (4,096)     | Text     | 40 RPM / 10K RPD | Enterprise Logic and Agentic Task Execution     |
| **MiniMax M3**                    | `minimaxai/minimax-m3`                    | 1M (1,048,576) | 64K (65,536)   | Text     | 40 RPM / 10K RPD | 1M Context Window, 64K Output Budget            |
| **Nemotron 3 Ultra 550B**         | `nvidia/nemotron-3-ultra-550b-a55b`       | 1M (1,048,576) | 262K (262,144) | Text     | 40 RPM / 10K RPD | 550B MoE (55B Active) Frontier Architecture     |
| **GPT OSS 120B (NVIDIA NIM)**     | `openai/gpt-oss-120b`                     | 131K (131,072) | 131K (131,072) | Text     | 40 RPM / 10K RPD | Full 131K Output Headroom Matching Input        |
| **GPT OSS 20B (NVIDIA NIM)**      | `openai/gpt-oss-20b`                      | 131K (131,072) | 131K (131,072) | Text     | 40 RPM / 10K RPD | Full 131K Output Token Capacity, Fast Inference |

---

### 5. OpenRouter (Zero-Cost Free Tier Catalog)

| Model Name                         | Model ID                                 | Context        | Max Output     | Modality     | Rate Limit      | Capabilities                                  |
| :--------------------------------- | :--------------------------------------- | :------------- | :------------- | :----------- | :-------------- | :-------------------------------------------- |
| **Nemotron 3 Super 120B (Free)**   | `nvidia/nemotron-3-super-120b-a12b:free` | 262K (262,144) | 262K (262,144) | Text         | 20 RPM / 50 RPD | 262K Output Generation at Zero Cost           |
| **GPT OSS 20B (Free)**             | `openai/gpt-oss-20b:free`                | 131K (131,072) | 32K (32,768)   | Text         | 20 RPM / 50 RPD | 20B Algorithmic Reasoning & Thinking          |
| **Cohere North Mini Code (Free)**  | `cohere/north-mini-code:free`            | 256K (262,144) | 64K (65,536)   | Text (Code)  | 20 RPM / 50 RPD | 64K Output Ceiling for Codebase Synthesis     |
| **Gemma 4 26B (Free)**             | `google/gemma-4-26b-a4b-it:free`         | 262K (262,144) | 32K (32,768)   | Text + Image | 20 RPM / 50 RPD | Free Multimodal Image & Document Analysis     |
| **Gemma 4 31B (Free)**             | `google/gemma-4-31b-it:free`             | 262K (262,144) | 32K (32,768)   | Text + Image | 20 RPM / 50 RPD | Free Multimodal 31B Visual Comprehension      |
| **Ling 3.0 Flash (Free)**          | `inclusionai/ling-3.0-flash:free`        | 262K (262,144) | 32K (32,768)   | Text         | 20 RPM / 50 RPD | 262K Context Window with Low Latency          |
| **Nemotron 3 Nano 30B (Free)**     | `nvidia/nemotron-3-nano-30b-a3b:free`    | 256K (262,144) | 32K (32,768)   | Text         | 20 RPM / 50 RPD | 30B MoE Lightweight Extraction                |
| **Nemotron Nano 9B v2 (Free)**     | `nvidia/nemotron-nano-9b-v2:free`        | 128K (131,072) | 8K (8,192)     | Text         | 20 RPM / 50 RPD | 9B Fast Response Times on Free Tier           |
| **Nemotron Nano 12B v2 VL (Free)** | `nvidia/nemotron-nano-12b-v2-vl:free`    | 128K (131,072) | 128K (128,000) | Text + Image | 20 RPM / 50 RPD | Multimodal Vision-Language with 128K Output   |
| **Poolside Laguna S 2.1 (Free)**   | `poolside/laguna-s-2.1:free`             | 262K (262,144) | 32K (32,768)   | Text (Code)  | 20 RPM / 50 RPD | Trained on Real-World Git Diffs & Refactoring |
| **Poolside Laguna XS 2.1 (Free)**  | `poolside/laguna-xs-2.1:free`            | 262K (262,144) | 32K (32,768)   | Text (Code)  | 20 RPM / 50 RPD | Ultra-Fast Real-Time Code Completion          |

---

## 🎨 Specialized Feature Engines

### 1. Slidev & PowerPoint (PPTX) Engine

- **AST-Driven Slidev Parser**: Converts prompts into presentation syntax (`---` delimited slides, `layout: cover | two-cols | fact | quote | section`, `::right::` slot partitions).
- **Enforced Layout Text Budgets**: Prevents slide text overflows with explicit word-count bounds.
- **PowerPoint (`.pptx`) & PDF Exporter**: Native browser export using `pptxgenjs` with high-contrast color cards and responsive geometry.
- **Interactive Presentation Deck**: In-app presentation mode with thumbnail overview grid, slide transitions, and interactive drawing canvas.

### 2. Publication-Grade Visual Architecture (39 Diagram Types)

- **Declarative Inline HTML/SVG**: Renders diagrams in Obsidian / True Black styling (`#09090b` canvas, `#121214` cards, `border-white/10` borders, `#f08a59` focal accents).
- **Supported Grammars**: Architecture topologies, Sequence message exchanges, C4 models, ER schemas, Flywheels, Swimlanes, Ishikawa root-cause diagrams, Sankey flow distributions, Medallion storage pipelines, Wardley maps, and UML class hierarchies.
- **Zero Heavy JS Libraries**: Pure declarative SVG markup with embedded CSS, interactive pan, zoom, and SVG export.

### 3. Real-Time Grounded Web Search

- **Strict Bracketed Citations**: Claims are mapped directly to numbered references `[1]`, `[2]` linking back to source URLs.
- **Verified DuckDuckGo Web Images**: Embedded verified visual images with contextual captions.
- **YouTube Explanation Cards**: Video preview cards with channel attribution, duration badges, and direct links.

### 4. Autonomous ReAct Agent Conductor (Rust Native)

- **Multi-Step Tool Coordination**: Native Rust runtime executing tools:
  - `fs_read`, `fs_write`, `list_dir` (Local filesystem I/O)
  - `web_search`, `fetch_webpage` (Live internet browsing)
  - `execute_command` (Controlled sandbox execution)
- **Live Plan Monitoring**: Step-by-step interactive plan viewer with active status badges, input/output inspection, and cancellation controls.

---

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/yashas-30/NYX.git
cd NYX

# Install monorepo dependencies
pnpm install
```

### 2. Development

```bash
# Run the Web App (Vite + React 19)
pnpm run dev:web

# Or run the Desktop Application (Tauri v2 + Rust)
pnpm run dev:desktop
```

### 3. Production Build & Verification

```bash
# Run full Vitest test suite (71+ automated tests)
pnpm test

# Run TypeScript typechecks across all monorepo packages
pnpm run typecheck

# Build web distribution assets
pnpm run build

# Verify Rust backend compilation
cd src-tauri && cargo check
```

---

## 🏛️ Monorepo Architecture

```
NYX/
├── apps/
│   ├── web/                     # React 19 + Vite 6 + Tailwind CSS v4 frontend
│   │   ├── src/core/prompts/    # Modular prompt routing (Slidev, Search, Diagrams, Code, Research)
│   │   ├── src/features/chat/   # Smooth streaming chat, typewriter, lightbox, video cards
│   │   ├── src/features/presentation/ # Slidev parser, interactive deck, PPTX exporter
│   │   ├── src/features/agents/ # Plan visualizer & execution monitors
│   │   └── src/shared/          # Model selector, API key vault, Zustand global stores
│   │
│   └── desktop/                 # Tauri v2 native desktop wrapper
│
├── packages/
│   ├── shared/                  # Central model registry, Zod schemas, provider types
│   │   └── src/models/          # Gemini, Groq, Mistral, NVIDIA, OpenRouter catalogs
│   └── config/                  # TypeScript & tooling configurations
│
└── src-tauri/                   # Rust Native Backend (Tauri v2)
    ├── src/llm/providers/       # Native SSE streaming for Gemini, Groq, Mistral, NVIDIA, OpenRouter
    ├── src/llm/local/           # Vulkan llama-server process manager & hardware detection
    ├── src/agents/core/         # ReAct agent loop & execution conductor
    ├── src/agents/tools/        # Filesystem, web search, media, and sandbox tools
    └── src/rag/                 # SQLite connection pooling & TurboVec vector embeddings
```

---

## 🔒 Security & Privacy

- **100% Client-Side Key Storage**: API keys are saved strictly on your local machine and never proxied through external servers.
- **GitHub CodeQL Analysis**: Integrated static analysis scanning on every push and pull request.
- **Weekly Vulnerability Audits**: Automated dependency vulnerability scanning via `pnpm audit`.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for details.
