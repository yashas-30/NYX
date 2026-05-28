<div align="center">

<img src="public/nyx-icon.png" alt="NYX Logo" width="80" height="80" />

# NYX

### Native Local Intelligence & Cloud Orchestration Platform

[![Version](https://img.shields.io/badge/version-3.0-0ea5e9?style=flat-square)](https://github.com/yashas-30/NYX/releases)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=flat-square&logo=fastify&logoColor=white)](https://fastify.dev)
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
| 🤖 **NYX Agent**                    | Planner → SubagentSwarm → Optimizer pipeline using whichever model you select              |
| ☁️ **Cloud Orchestration**          | Gemini, OpenRouter, NVIDIA NIM, OpenCode — unified under one interface                     |
| 📚 **Codebase Knowledge**           | Index your local codebase and query it contextually during code generation                 |
| ⚡ **Zero-Delay Streaming**         | Dual Express + Fastify server with TCP `setNoDelay`, DNS pre-warming, SHA-256 cache        |
| 🔐 **100% Local Keys**              | API keys stay in your browser's localStorage — never sent to a database                    |
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
npm install

# Start (Express port 3000 + Fastify port 3001)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### API Keys (Cloud Models)

Paste keys directly in the **Settings** tab inside NYX — no `.env` file needed:

| Provider      | Key Format  | Free Tier                                              |
| ------------- | ----------- | ------------------------------------------------------ |
| Google Gemini | `AIzaSy...` | ✅ Yes — [Get Key](https://aistudio.google.com/)       |
| OpenRouter    | `sk-or-...` | ✅ Yes — [Get Key](https://openrouter.ai/)             |
| NVIDIA NIM    | `nvapi-...` | ✅ 1000 credits — [Get Key](https://build.nvidia.com/) |
| OpenCode      | Token       | ✅ Sandbox — [Get Key](https://opencode.ai/)           |

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

When you send a prompt with the NYX Agent model selected, it runs an advanced **multi-stage coordination pipeline**:

```
Prompt ──→ [ Planner Agent ]   ──→  Execution Blueprint
           [ SubagentSwarm ]   ──→  Parallel Implementation (Coder + Reviewer + Tester)
           [ Optimizer Agent ] ──→  Final Polished Output
```

- **Planner Agent**: Analyzes requirements and constructs a comprehensive step-by-step execution plan.
- **SubagentSwarm**: Co-ordinates specialized subagents (Coder, Reviewer, Tester) running in parallel to implement the plan, review for security/correctness, and verify results.
- **Optimizer Agent**: Takes the raw outputs, applies style guides/critique rules, and returns a single polished block. Only this final output is displayed.
- Works with any model you select in the model selector.

---

## 🏗️ Architecture

```
NYX/
├── server.ts                  ← Entry point — Express (3000) + Fastify (3001)
│
├── server/
│   ├── lib/
│   │   ├── fastifyApi.ts      ← Zero-delay SSE streaming, DNS warmup, TCP tuning
│   │   ├── localModelRunner.ts← llama-server lifecycle (spawn, health, kill)
│   │   ├── localModelManager.ts← Model download, VRAM offload, disk management
│   │   ├── unifiedEngine.ts   ← Single inference entrypoint (local + cloud)
│   │   ├── cache.ts           ← SHA-256 disk cache (`.nyx-cache/`)
│   │   └── keyVault.ts        ← Secure per-session API key storage
│   └── routes/
│       ├── nyx.ts             ← NYX agent pipeline endpoint
│       ├── localModels.ts     ← GGUF download, status, delete
│       └── terminal.ts        ← Code execution sandbox
│
└── src/
    ├── components/
    │   ├── CoderDashboard.tsx  ← Global layout and state coordinator
    │   ├── dashboard/
    │   │   ├── ModelRegistryView.tsx  ← NYX Native Library (local models only)
    │   │   └── SettingsView.tsx       ← API keys, quotas, gateway config
    │   └── model-card/
    │       └── ModelSelector.tsx      ← Unified cloud + local model picker
    ├── features/coder/
    │   ├── CoderPage.tsx       ← IDE workspace
    │   ├── components/
    │   │   ├── PromptInput.tsx ← Prompt pill + per-model inference settings
    │   │   ├── MessageList.tsx ← Syntax-highlighted streaming response
    │   │   └── CoderHeader.tsx ← Live TPS + latency display
    │   └── hooks/
    │       ├── useAgentPipeline.ts   ← 3-stage NYX agent orchestration
    │       └── useCoderLogic.ts      ← Model routing, streaming, history
    ├── config/
    │   ├── models.ts           ← All cloud + local model definitions
    │   └── agents.ts           ← NYX agent personas and system prompts
    └── core/
        └── services/ai.service.ts    ← Unified AI inference client
```

---

## ⚡ Performance Architecture

NYX uses a dual-server design to maximise streaming throughput:

### Express Gateway (Port 3000)

- Serves the React SPA
- SHA-256 prompt cache — 0ms for repeated queries
- API key proxy and quota checking

### Fastify Engine (Port 3001)

- **TCP `setNoDelay(true)`** — eliminates the 40ms Nagle's Algorithm buffer
- **DNS pre-warming** — background Cloudflare lookups remove first-request latency
- **Connection keep-alives** — 75s persistent sockets, no repeated TLS handshakes
- **Zero-copy SSE** — EventSource chunks flushed with no buffering overhead

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
