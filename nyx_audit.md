# NYX Codebase Audit and Architecture Overview

## 1. Introduction

This document provides a comprehensive audit of the NYX application, a Native Local Intelligence & Cloud Orchestration Platform. The app is designed to run local LLMs (via GPU) alongside cloud models (like Google Gemini) using a sophisticated dual-server backend architecture and a React-based frontend.

## 2. Frontend Architecture

The frontend is built with React 19, Vite, and TailwindCSS v4, adopting a premium glassmorphism and dark-first design system.

- **Framework:** React SPA (Single Page Application).
- **Core Layout:** Driven by `CoderDashboard.tsx` and the `model-card` module to unify the model selection between local and cloud providers.

### 2.1 The Chat Page (`src/features/chat/`)

The chat feature provides a conversational interface for interacting with selected models.

- It maintains message history, handles real-time Server-Sent Events (SSE) streaming updates to populate the UI without delays.
- Features micro-animations for message blocks and uses specialized prompt inputs that dynamically adapt to the active model.

### 2.2 The Coder Page (`src/features/coder/`)

The coder workspace is specialized for code generation and software engineering tasks.

- **Components:** Uses a specialized `PromptInput` for complex multi-line requests with per-model inference settings, a syntax-highlighted `MessageList`, and a `CoderHeader` that shows live TPS (Tokens Per Second) and latency metrics.
- **Logic:** Powered by `useCoderLogic.ts` for handling code-specific streaming and history, and `useAgentPipeline.ts` for coordinating multi-stage code generation.

## 3. Backend Architecture

NYX uses a highly optimized dual-server architecture:

- **Express Gateway (Port 3000):** Serves the React SPA, provides a SHA-256 prompt cache for repeated queries, and handles API key proxying securely (keys stored in `localStorage` in the browser, verified here).
- **Fastify Engine (Port 3001):** Optimized for zero-delay SSE streaming via TCP `setNoDelay(true)`, background DNS pre-warming, and zero-copy EventSource chunks for maximum throughput.

### 3.1 Local Model Management

- Located in `server/features/local-models` and `server/lib/localModelManager.ts`.
- Manages the entire lifecycle of local GGUF models. It downloads models, spawns the built-in `llama-server`, offloads layers to VRAM, and gracefully kills processes when done.
- Fallbacks exist to interface with Ollama or LM Studio running on `localhost`.

### 3.2 Cloud Model Orchestration

- Managed via `server/lib/unifiedEngine.ts` and the `ai-providers` feature.
- Securely accepts prompts and the user's local API keys to stream generation from cloud providers (e.g., Gemini) without storing keys in a centralized database.

## 4. Generative AI & SDK Integration (`src/core/services/ai.service.ts`)

- **Unified Engine:** A single API layer (`UnifiedEngine.executeStream`) abstraction over both cloud APIs (Gemini SDK/REST endpoints) and local native AI APIs.
- Transforms uniform system/user/assistant prompt shapes into the specific formats required by Gemini (using Google's Generative AI REST structure `v1beta/models/:streamGenerateContent`) or local LLMs (via specialized prompt formatting `<|user|>` tags).

## 5. Verification Process and Agent Pipeline

The application utilizes an advanced NYX Agent multi-stage pipeline, orchestrating tasks for code reliability and security:

- **Planner Agent:** Analyzes the prompt and constructs an execution blueprint.
- **SubagentSwarm (Parallel Workers):**
  - **Coder:** Implements the required code.
  - **Reviewer:** Checks code for security vulnerabilities, syntax flaws, and best practices.
  - **Tester:** Verifies the implementation conceptually or via terminal sandboxing.
- **Optimizer Agent:** Aggregates outputs, applies critique rules, and synthesizes the final polished code block shown to the user.
- **Codebase Graphing (Graphify):** A local knowledge graph in `graphify-out/` provides deep architectural awareness to agents for verification against existing module structures.

## 6. Security and Local-first Philosophy

- **Key Storage:** Cloud provider API keys remain in browser `localStorage`, bypassing `.env` requirements and backend persistence.
- **Local Autonomy:** For local models, data never leaves the user's GPU, assuring maximum privacy and enterprise security compliance.
