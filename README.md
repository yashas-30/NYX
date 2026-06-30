<div align="center">

<img src="public/nyx-icon.png" alt="NYX Logo" width="80" height="80" />

# NYX

### Native Local Intelligence & Cloud Orchestration Platform

[![Version](https://img.shields.io/badge/version-3.0-0ea5e9?style=flat-square)](https://github.com/yashas-30/NYX/releases)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)

**NYX** is a premium, high-fidelity AI coding environment and runner that executes powerful local models **locally on your GPU** and orchestrates cloud LLMs, featuring advanced model management, side-by-side comparisons, and zero-delay streaming inside a beautifully crafted interface.

[**Live Demo**](https://yashas-30.github.io/NYX) · [**Releases**](https://github.com/yashas-30/NYX/releases) · [**Issues**](https://github.com/yashas-30/NYX/issues)

</div>

---

## ✨ What Makes NYX Different

| Feature                             | NYX                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| 🖥️ **Local GGUF Models**            | Run Llama 3, Qwen, Gemma, Mistral, Phi, DeepSeek **on your GPU** via built-in llama-server |
| ⚙️ **Per-Model Inference Controls** | GPU layers, context size, temperature, Top-P/K, Mirostat — per model, not global           |
| 🤖 **NYX Agent Swarm**              | Client-side agent pipeline (Planner → SubagentSwarm → Optimizer) coordinating tasks        |
| ☁️ **Cloud Orchestration**          | Gemini — unified under one interface                                                       |
| 📚 **Codebase Knowledge**           | Index your local codebase and query it contextually during code generation                 |
| ⚡ **Zero-Delay Streaming**         | Tauri Rust backend with native streaming, parallel execution, and built-in SQLite          |
| 🔐 **Secure Local Keys**            | Keys stored client-side (browser/Tauri) and cached in a memory-only server vault           |
| 🎨 **Premium Design**               | Glassmorphism, spring physics, micro-animations, dark-first design                         |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18+
- **GPU** (optional but recommended for local models) — NVIDIA or AMD with Vulkan support

### Install & Run

```bash
# Clone
git clone https://github.com/yashas-30/NYX.git
cd NYX

# Install dependencies
pnpm install

# Start the NYX Desktop application (Tauri)
pnpm run dev:desktop
```

Open the NYX window that appears. Note: NYX operates as a native application with a local Rust backend rather than a standalone web server.

### API Keys (Cloud Models)

Paste keys directly in the **Settings** tab inside NYX — no `.env` file needed:

| Provider      | Key Format  | Free Tier                                        |
| ------------- | ----------- | ------------------------------------------------ |
| Google Gemini | `AIzaSy...` | ✅ Yes — [Get Key](https://aistudio.google.com/) |

---

## 🖥️ NYX Native Library — Local Models

NYX ships with a built-in model downloader and runner. No Ollama, no LM Studio needed.

### Supported Model Families

| Family                 | Sizes        | VRAM      |
| ---------------------- | ------------ | --------- |
| **Llama 3.1 / 3.3**    | 8B, 70B      | 6–48 GB   |
| **Qwen 2.5 / QwQ**     | 1.5B → 72B   | 1.5–48 GB |
| **Gemma 3**            | 4B, 12B, 27B | 3–20 GB   |
| **DeepSeek R1 / V3**   | 7B → 671B    | 4 GB+     |
| **Phi-4**              | 14B          | 10 GB     |
| **Mistral / Mixtral**  | 7B, 8x7B     | 5–28 GB   |
| **LLaVA** (multimodal) | 7B, 13B      | 6–12 GB   |

### Per-Model Inference Controls

Click the **⚙ settings icon** in the prompt bar (only visible when a local model is selected):

```
GPU / VRAM
  └── GPU Layers (ngl)  — 0 (CPU Only) → 99 (Full VRAM)

Context & Memory
  └── Context Size       — 512 → 32,768 tokens

CPU Compute
  ├── CPU Threads        — 1–32
  └── Batch Size         — 64–2048

Sampling
  ├── Temperature        — 0.0 → 2.0
  ├── Top-P (Nucleus)    — 0.0 → 1.0
  ├── Top-K              — 0–200
  ├── Repeat Penalty     — 1.0 → 2.0
  └── Mirostat           — Off / v1 / v2
```

Settings reset automatically when you switch models.

---

## 🤖 NYX Agent Pipeline

When you select the NYX Agent, the client-side `SubagentOrchestrator` runs an advanced multi-agent coding loop:

```
Prompt ──→ [ Planner Agent ]   ──→  Execution Checklist (task.md)
           [ SubagentSwarm ]   ──→  Parallel Coder & Reviewer agents implementing changes
           [ Optimizer Agent ] ──→  Final Polished Response
```

- **Planner Agent**: Analyzes codebase context, requirements, and structures a checklist on disk.
- **SubagentSwarm**: Coordinates specialized client-side agents running in parallel to edit files and review changes.
- **Optimizer Agent**: Takes the raw changes and comments, applies lint/style rules, and returns a polished result.
- Works transparently with any model you select in the model selector.

---

## 🏗️ Architecture

NYX is structured as a pnpm monorepo using Turborepo for efficient building:

```
NYX/
├── apps/
│   ├── web/                   ← React 19 + Vite + Tailwind v4 frontend SPA
│   └── desktop/               ← Tauri v2 desktop shell wrapper
│
├── packages/
│   └── shared/                ← Shared models catalog config, schemas, and types
│
└── src-tauri/                 ← Native Rust backend (LLM streaming, Agents, DB)
```

### Backend Architecture (`src-tauri/`)
- **`src/llm/`**: Unified inference coordinator handling local models (via llama.cpp) and cloud providers.
- **`src/agents/`**: Core ReAct agent loop natively built in Rust for multi-agent capabilities.
- **`src/db/`**: SQLite persistence with connection pooling for memories, chat history, and semantic search.
- **`src/commands/`**: Dozens of native capabilities exposed to the frontend via Tauri IPC.

### Frontend Architecture (`apps/web/`)
- **`web/src/features/`**: Feature-sliced architecture (e.g. `features/chat`, `features/coder`, `features/model-registry`).
- **`web/src/core/services/ai.service.ts`**: Unified client interfacing with the Tauri IPC bridge.

---

## ⚡ Performance Architecture

NYX runs on a high-throughput Native Rust backend:

- **Unified Application** — Integrates seamlessly via Tauri without the overhead of an HTTP server.
- **Native OS Integrations** — Zero-copy IPC message passing for instantaneous UI updates.
- **Parallel Execution** — Agent actions and multi-model inferences run concurrently utilizing Tokio's async runtime.
- **Built-in Inference** — Spawns `llama-server-vulkan` internally, removing the need for third-party middleware like Ollama.

---

## 🎨 Design System

NYX is built around a **dark-first, glassmorphism** design system:

- **Background**: `#0c0c0e` / `#131315` — near-black with warm undertone
- **Surface**: `bg-zinc-900/85` with `backdrop-blur-xl` and `border-white/8`
- **Accent**: `#0ea5e9` (blue-500) for local GPU features; `#8b5cf6` (violet-500) for AI features
- **Typography**: Geist Variable — ultra-clean mono-sans pairing
- **Animations**: Framer Motion spring physics (`stiffness: 380, damping: 32`)
- **Micro-interactions**: Rotate on open, pulse dots, ring glow on focus

---

## 🗺️ Roadmap

- [ ] **Voice Input** — Whisper-powered local speech-to-text
- [ ] **Image Generation** — Stable Diffusion via local GGUF runner
- [ ] **Multi-file Context** — Drag & drop entire project folders
- [ ] **Model Quantization** — In-app Q4/Q8 quantization controls
- [ ] **Collaborative Sessions** — Share a coder session via URL
- [ ] **Plugin System** — Community-built tool extensions

---

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

```bash
git checkout -b feature/my-feature
git commit -m 'feat: add my feature'
git push origin feature/my-feature
# Open a Pull Request
```

---

<div align="center">

Built with 🌌 by [Yashas](https://github.com/yashas-30) · MIT License

</div>
