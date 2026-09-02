<div align="center">

<img src="public/nyx-icon.png" alt="NYX Logo" width="96" height="96" />

# NYX

### The Ultimate Native AI Studio & Local GPU Operating Environment

[![Version](https://img.shields.io/badge/version-0.5.0-0ea5e9?style=flat-square)](https://github.com/yashas-30/NYX/releases)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-1.75+-CE422B?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)

**NYX** is an all-in-one native AI workspace designed to give you **frontier intelligence with zero subscription costs**. It lets you run open-weight GGUF models directly on your local GPU with 100% privacy, or tap into 40 top-tier cloud models with massive context windows, real-time web search, interactive slide generation, 39 diagram types, and autonomous ReAct agents — all wrapped in an obsidian **True Black Minimalist** interface.

[**Live Web App**](https://yashas-30.github.io/NYX) · [**Download Desktop Releases**](https://github.com/yashas-30/NYX/releases) · [**Report an Issue**](https://github.com/yashas-30/NYX/issues)

</div>

---

## 🌟 Why NYX?

Most AI tools force you into costly monthly subscriptions, lock you into cloud-only silos, or require complicated terminal setups. **NYX changes that completely:**

1. **100% Free & Private Local Execution**: Run any open-source model (Llama 3.3, Qwen 2.5, Gemma 3, DeepSeek, Mistral) directly on your NVIDIA, AMD, or Intel GPU via built-in Vulkan acceleration. No Ollama, no LM Studio, no Docker, and no internet connection required.
2. **40 Curated Free Cloud Models**: If you don't have a high-end GPU, NYX gives you instant access to 40 frontier models from Google Gemini, Groq LPUs, Mistral AI, NVIDIA NIM, and OpenRouter Free Tier.
3. **Beyond Plain Chat**: NYX isn't just a chatbot — it's a creative and analytical powerhouse that builds presentations you can export to PowerPoint, draws editorial system diagrams, conducts grounded research with verified citations, and runs autonomous multi-step coding agents.

---

## 🚀 Key Features In Depth

---

### 1. ⚡ Real-Time Live Application Preview (Split CodeBlocks)

Watch apps build and run in real time as the AI generates code:

- **Automatic Split View**: When generating code for web applications (HTML/CSS/JS, React TSX/JSX, SVG graphics, Mermaid diagrams, or Slidev decks), NYX automatically opens a responsive **Split View**.
- **Concurrent Live Compilation**: The upper pane displays the streaming syntax-highlighted code, while the lower pane continuously compiles, mounts, and renders the live running app simultaneously as tokens stream in.
- **Debounced Execution Engine**: A 300ms stream-debounced runner prevents iframe reloads or DOM thrashing on individual characters, ensuring silky-smooth rendering.
- **View Controls**: Toggle between **Split**, full-height **Live Preview**, raw **Source Code**, or WASM **Terminal** with one click. Includes a live reload button for instant state refreshes.

---

### 2. 🖥️ Native Local GPU Inference Engine (Zero Middleware)

NYX includes its own internal `llama.cpp` Vulkan inference server embedded directly into the Rust backend:

- **True Hardware Acceleration**: Automatically detects your GPU VRAM and CPU threads to deliver maximum tokens-per-second via Vulkan GPU shaders.
- **100% Offline & Private**: Your prompts, documents, and code never leave your device.
- **HuggingFace Hub Explorer**: Search, explore, download, and manage GGUF quantized models directly within NYX.
- **Per-Model Fine-Tuned Controls**:
  - **GPU Layer Offload (`ngl`)**: Slide seamlessly from 0 (CPU-only) to 99 (Full VRAM offloading).
  - **Dynamic Context Length**: Adjust context memory allocation from 512 up to 131,072 tokens per model.
  - **Advanced Sampling**: Full control over Temperature, Top-P, Top-K, Repeat Penalty, and Mirostat v1/v2 algorithms.
  - **Thread & Batch Tuning**: Calibrate CPU thread count and batch evaluation size for stutter-free generation.

---

### 3. ☁️ Multi-Provider Free Cloud Intelligence

NYX connects natively to 5 premier AI providers, giving you access to **40 curated models** covering reasoning, coding, long context, and vision:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               NYX UNIFIED MODEL SELECTOR                               │
├──────────────────┬──────────────────┬──────────────────┬──────────────────┬────────────┤
│  GOOGLE GEMINI   │    GROQ CLOUD    │    MISTRAL AI    │    NVIDIA NIM    │ OPENROUTER │
│   (6 Models)     │   (5 LPU Models) │   (7 Models)     │   (11 Models)    │ (11 Free)  │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┴────────────┘
```

#### 🌐 Complete Model Catalog

#### 🔹 Google Gemini (1M Context & Hybrid Reasoning)

- **`Gemini 3.7 Flash`**: Google's frontier model with controllable hybrid thinking budgets (0–64K reasoning tokens), 1M context, and native audio/video/image comprehension.
- **`Gemini 3.6 Flash`**: High-speed workhorse delivering instant generation across 1M tokens.
- **`Gemini 3.5 Flash-Lite`**: Ultra-high concurrency model (30 RPM / 4M TPM) built for parallel workflows and subagent execution.
- **`Gemini 3.1 Flash-Lite`**: Rapid micro-task and real-time response model with a full 1M context window.
- **`Gemma 4 31B`**: Google's flagship dense open-weights model featuring multimodal vision and deep mathematical reasoning.
- **`Gemma 4 26B MoE`**: Sparse Mixture-of-Experts model (4B active parameters) combining blazing speed with 262K context.

#### ⚡ Groq Cloud (Ultra-Low Latency LPUs)

- **`GPT OSS 120B`**: OpenAI's 120B parameter reasoning model running at blazing speed on Groq LPUs with a 65K max output token limit.
- **`GPT OSS 20B`**: Lightweight 20B reasoning model delivering near-instant responses with 65K max output capacity.
- **`Groq Compound`**: Specialized agentic model engineered for compound multi-step reasoning and automated tool execution.
- **`Groq Compound Mini`**: Ultra-fast agentic router for rapid intermediate subagent verification.
- **`Qwen 3.6 27B`**: High-throughput 27B multilingual model generating ~400+ tokens per second.

#### 🇫🇷 Mistral AI (European Frontier & Code Intelligence)

- **`Mistral Medium 3.5 (128B)`**: 128B flagship medium model with 256K context and multimodal image understanding.
- **`Mistral Small 4`**: Fast, lightweight multimodal model with 256K context for responsive everyday chat.
- **`Mistral Large 3`**: Top-tier foundation model with 256K context and deep multilingual reasoning.
- **`Ministral 3 8B`**: Compact edge model pairing an 8B footprint with a massive 256K context window.
- **`Codestral`**: Industry-standard coding model trained on 80+ languages with Fill-In-The-Middle (FIM) support.
- **`Ministral 3 3B` & `Ministral 3 14B`**: Fast edge vision models for instant extraction and multimodal tasks.

#### 🟢 NVIDIA NIM (Enterprise Frontier Scale & DGX Cloud)

- **`Nemotron 3 Super 120B`**: 120B MoE flagship model with 1M context and a massive 262K maximum output capacity.
- **`Nemotron 3 Nano 30B`**: 30B MoE (3B active) model with 262K context for high-throughput batching.
- **`Llama 3.1 Nemotron Ultra 253B`**: Massive 253B dense frontier model accelerated on NVIDIA DGX Cloud.
- **`Meta Llama 3.3 70B Instruct`**: Meta's premier open model running with TensorRT-LLM low-latency acceleration.
- **`Mistral Nemotron`**: Co-developed by Mistral and NVIDIA for high-efficiency logic and coding.
- **`Gemma 4 31B (NVIDIA NIM)`**: 31B dense instruction model running on high-speed NIM clusters.
- **`Mistral Large 2 Instruct`**: Enterprise-grade logic and function calling with 128K context.
- **`MiniMax M3`**: Ultra-large scale model featuring 1M input context and 64K output token budget.
- **`Nemotron 3 Ultra 550B`**: 550B MoE (55B active) massive enterprise reasoning model with 1M context.
- **`GPT OSS 120B & 20B (NVIDIA NIM)`**: Full 131K output capacity matching the 131K input context window.

#### 🌍 OpenRouter Free Tier (Zero-Cost Curated Fleet)

- **`Nemotron 3 Super 120B (Free)`**: 262K context and 262K output headroom with thinking reasoning at zero cost.
- **`GPT OSS 20B (Free)`**: 131K context and 32K output ceiling for algorithmic coding and reasoning.
- **`Cohere North Mini Code (Free)`**: 256K context specialized for multi-file codebase synthesis.
- **`Gemma 4 26B & 31B (Free)`**: Multimodal vision and document parsing on a 262K context window.
- **`Ling 3.0 Flash (Free)`**: Fast 262K context model with strong multilingual comprehension.
- **`Nemotron 3 Nano 30B & Nano 9B v2 (Free)`**: Snappy lightweight reasoning models for quick Q&A.
- **`Nemotron Nano 12B v2 VL (Free)`**: Multimodal vision-language model with a huge 128K output ceiling.
- **`Poolside Laguna S 2.1 & XS 2.1 (Free)`**: Specialized coding models trained on real-world Git diffs and refactoring.

---

### 4. 📊 Slidev & PowerPoint (PPTX) Studio

Turn any idea, topic, or document into a presentation with zero formatting hassle:

- **Structural Slidev Engine**: Automatically generates slides using clean Slidev Markdown grammar (`layout: cover | two-cols | fact | quote | section`, `::right::` slot partitioning, presenter notes).
- **Layout-Specific Text Budgets**: Prevents slide text overflows by calculating optimal density per slide type.
- **One-Click Export to PowerPoint (`.pptx`)**: Generates real Microsoft PowerPoint files with custom styled visual cards, bold titles, and responsive geometries via `pptxgenjs`.
- **Interactive Presentation Deck**:
  - **Full-Screen Presentation Mode** with smooth slide transitions.
  - **Slide Overview Grid**: Thumbnail view to jump to any slide instantly.
  - **Live Drawing Canvas**: Annotate, highlight, and draw directly over your slides during a presentation.
  - **PDF Export**: Print-ready high-resolution slides.

---

### 5. 📐 39 Publication-Grade Visual Architecture Types

Stop generating unstyled Mermaid diagrams. NYX generates clean, declarative inline **HTML/SVG diagrams** styled in an obsidian True Black palette (`#09090b` canvas, `#121214` cards, `border-white/10`, `#f08a59` focal accents):

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   Client App    ├──────►│   API Gateway   ├──────►│  Microservices  │
│  (React 19/Web) │       │   (Tauri/Rust)  │       │  (Vulkan / NIM) │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

**Supported Diagram Grammars**:

1. **Architecture Topologies** (Cloud stacks, microservices, container clusters)
2. **Sequence Flows** (Time-ordered actor message exchanges & auth handshakes)
3. **C4 Models** (Context, Container, Component, and Code architectural levels)
4. **Swimlane Workflows** (Cross-functional process handoffs)
5. **Entity-Relationship (ER) & Database Schemas** (Tables, columns, foreign keys)
6. **State Machines** (States, transitions, triggers, and guards)
7. **Reinforcing Flywheels & Loops** (System dynamics with central hubs)
8. **Sankey Diagrams** (Flow volumes and branching pipelines)
9. **Medallion Data Pipelines** (Bronze → Silver → Gold storage architectures)
10. **Wardley Maps, Timelines, Ishikawa Fishbone Root-Cause Models, and 29 more layout types.**

_Includes interactive pan, zoom, full-screen expansion, and direct SVG export._

---

### 6. 🔍 Real-Time Grounded Web Search & Video Grounding

Search the web in real-time without leaving your conversation:

- **Factual Attribution**: Every fact, metric, and breaking news item is grounded with numbered citations `[1]`, `[2]` linking directly to verified sources.
- **Verified Web Images**: Contextual DuckDuckGo search images embedded inline with descriptive captions.
- **YouTube Explanation Cards**: Video preview cards displaying video thumbnails, channel names, duration badges, and direct links.
- **Temporal Grounding**: Automatically synchronizes today's date so queries like _"what happened today?"_ or _"latest stock prices"_ deliver accurate, current information.

---

### 7. 🤖 Autonomous ReAct Agent Conductor (Rust Native)

When you need multi-step problem solving, NYX's native Rust agent takes over:

- **Plan-First Architecture**: Structures a step-by-step execution plan before making changes.
- **Native Tool Calling**:
  - `fs_read` / `fs_write` / `list_dir` — Inspect and modify local project files safely.
  - `web_search` / `fetch_webpage` — Search the live internet and scrape full markdown content.
  - `execute_command` — Run terminal commands and test scripts in a controlled sandbox.
- **Live Plan Monitor**: Visual progress card showing step status (pending, active, completed, failed) with full input/output inspection.

---

### 8. 🧠 Persistent Memory & Semantic Recall (TurboVec)

- **Vector-Powered Memory**: Indexes your conversation history, project preferences, and user context locally in SQLite with TurboVec vector embeddings.
- **Zero Privacy Leakage**: Your long-term memory is stored locally on your machine and never synced to external analytics servers.

---

### 9. 🎨 True Black Minimalist Design System

Built following the **True Black Minimalist** design standard (`DESIGN.md`):

- **Canvas Background**: Pure `#000000` (True Black) for zero eye strain on OLED displays.
- **Surface Elevation**: `#09090b` (Primary Surface) and `#121214` (Elevated Cards).
- **Hairline Obsidian Borders**: `border-white/10` for subtle visual depth.
- **Typography Stack**: Geist Sans for clean readability, Geist Mono for code blocks, and Instrument Serif for editorial titles.
- **Smooth Streaming Experience**: Zero-delay typewriter streaming with expandable chain-of-thought `<think>` reasoning traces.

---

---

## 🌐 Testing the Web App (Live Demo & Local Setup)

Viewers and evaluators can test NYX instantly in any web browser without cloning or installing dependencies, or run it locally:

### Option 1: Instant Live Web App (Zero Install)

👉 **[Launch NYX on GitHub Pages](https://yashas-30.github.io/NYX/)**

- **Runs in Any Modern Browser**: Works immediately on Chrome, Edge, Safari, Firefox, and Brave on both desktop and mobile devices.
- **Client-Side SPA**: Built as a pure client-side application with client-side routing, offline PWA support, and sub-50ms tab switching.
- **Zero Server Setup**: Connects directly from your browser to AI provider endpoints.

### Option 2: Run Web App Locally for Testing

```bash
# 1. Clone the repository
git clone https://github.com/yashas-30/NYX.git
cd NYX

# 2. Install monorepo dependencies
pnpm install

# 3. Launch the Vite development server
pnpm run dev:web
```

Open **`http://localhost:3000`** in your browser.

### Option 3: Run Full Native Desktop Application (Tauri v2 + Rust)

```bash
# Requires Rust Toolchain (https://rustup.rs)
pnpm run dev:desktop
```

---

## 🔑 How to Set Up Free API Keys (Step-by-Step Guide)

To start chatting, writing code, generating presentations, and rendering architecture diagrams, you only need **at least one free API key**. NYX lets you configure keys for any combination of providers:

### Step 1: Where to Navigate in NYX

1. Open the NYX Web App or Desktop App.
2. In the left navigation sidebar, click the **Settings (⚙️)** gear icon (or click the **API Key / Provider Status badge** in the model selector at the top of the chat page).
3. The **Settings** panel opens, displaying dedicated input fields for each supported AI provider:
   - **Google Gemini**
   - **Groq Cloud**
   - **Mistral AI**
   - **OpenRouter**
   - **NVIDIA NIM**
4. Paste your key into the corresponding field and click **Save**. A confirmation toast will verify that your key is active.

---

### Step 2: Where & How to Get Your FREE API Keys

#### 1. 🔹 Google Gemini (Recommended — 100% Free Tier)

_Google AI Studio provides a free tier with high rate limits (15 RPM / 1M TPM)._

1. Go to **[Google AI Studio API Keys](https://aistudio.google.com/app/apikey)**.
2. Sign in with your standard Google account.
3. Click the blue **"Create API key"** button.
4. Choose an existing Google Cloud project or click **"Create key in new project"** (takes ~5 seconds).
5. Copy the generated key (format: `AIzaSy...`).
6. In NYX Settings, paste it into the **Google Gemini API Key** input and click **Save**.
7. **Unlocked Capabilities**: Access to **Gemini 3.7 Flash**, **Gemini 3.6 Flash**, **Gemini 3.5 Flash-Lite**, **Gemma 4 31B**, full 1M context windows, hybrid thinking reasoning budgets (0–64K tokens), and grounded web search.

#### 2. ⚡ Groq Cloud (Ultra-Fast LPUs — Free Developer Tier)

_Groq provides near-instant inference speeds exceeding 400–500 tokens per second._

1. Go to **[Groq Console API Keys](https://console.groq.com/keys)**.
2. Sign up or log in (free with GitHub or Google).
3. Click **"Create API Key"**, enter a friendly name (e.g., `NYX`), and click **Submit**.
4. Copy the secret key immediately (format: `gsk_...`).
5. In NYX Settings, paste it into the **Groq API Key** input and click **Save**.
6. **Unlocked Capabilities**: Access to **GPT OSS 120B**, **GPT OSS 20B**, **Qwen 3.6 27B**, and **Groq Compound** with real-time streaming.

#### 3. 🇫🇷 Mistral AI (European Frontier Intelligence)

_Mistral AI offers free developer credits and access to state-of-the-art code models._

1. Go to **[Mistral La Plateforme](https://console.mistral.ai/api-keys/)**.
2. Sign up for a free account.
3. Navigate to **API Keys** in the dashboard and click **"Create new key"**.
4. Copy your secret API key.
5. In NYX Settings, paste it into the **Mistral API Key** input and click **Save**.
6. **Unlocked Capabilities**: Access to **Codestral** (industry-leading coding engine), **Mistral Large 3**, **Mistral Small 4**, and **Ministral**.

#### 4. 🌍 OpenRouter (Dozens of Curated Free Models)

_OpenRouter aggregates dozens of top open-source models with completely free endpoints._

1. Go to **[OpenRouter Keys](https://openrouter.ai/keys)**.
2. Sign in with Google, GitHub, or Email.
3. Click **"Create Key"**, give it a name (e.g., `NYX`), and copy the key (format: `sk-or-v1-...`).
4. In NYX Settings, paste it into the **OpenRouter API Key** input and click **Save**.
5. **Unlocked Capabilities**: Access to 11+ completely free models marked with `:free`, including **Nemotron 3 Super 120B (Free)**, **GPT OSS 20B (Free)**, **Cohere North Mini Code (Free)**, and **Gemma 4 (Free)**.

#### 5. 🟢 NVIDIA NIM (DGX Cloud Enterprise Acceleration)

_NVIDIA provides 1,000 free evaluation credits to run models on DGX Cloud infrastructure._

1. Visit **[NVIDIA Build NIM](https://build.nvidia.com/)**.
2. Sign in with your NVIDIA developer account.
3. Browse to any model (e.g., _Meta Llama 3.3 70B Instruct_ or _Nemotron 3 Super_).
4. Click **"Get API Key"** and copy the generated key (format: `nvapi-...`).
5. In NYX Settings, paste it into the **NVIDIA NIM API Key** input and click **Save**.

#### 6. 🏠 Local Models (Ollama & Vulkan — Zero API Keys Required)

_If you prefer running completely offline without any cloud accounts:_

- **Ollama**: If you have [Ollama](https://ollama.com/) running locally (`ollama serve`), NYX detects your local instance on `http://localhost:11434` automatically.
- **Embedded Vulkan GPU (Desktop App)**: In the NYX Desktop application, GGUF models are loaded directly onto your GPU VRAM via built-in Vulkan shaders with zero external processes or API keys.

---

### 🔒 Privacy & Secret Storage Guarantee

- **100% Client-Side Storage**: All API keys are stored strictly in your browser or desktop environment's private `localStorage`.
- **Zero Third-Party Relays**: NYX has no intermediate proxy servers, tracking telemetry, or cloud logging.
- **Direct Encrypted Transport**: Prompts and API keys are transmitted directly and securely over HTTPS/SSE only to the official provider endpoints (`generativelanguage.googleapis.com`, `api.groq.com`, `api.mistral.ai`, `openrouter.ai`, `integrate.api.nvidia.com`).

---

## 🧪 Automated Testing & Verification

```bash
# Run all Vitest unit and integration tests (60+ passing tests)
pnpm test

# Run TypeScript typechecks across all monorepo packages
pnpm run typecheck

# Build production web bundle for GitHub Pages
pnpm run build:pages

# Verify Rust backend compilation (for desktop app)
cd src-tauri && cargo check
```

---

## 🔒 Security & Privacy

- **Local-First Secret Vault**: API keys are stored exclusively in your browser/desktop storage and cached in memory.
- **GitHub CodeQL Analysis**: Static security scanning on every push and pull request.
- **Supply-Chain Hardening**: Upstream dependencies audited via `pnpm audit`.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for details.
