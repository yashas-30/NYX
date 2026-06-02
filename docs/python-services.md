# Python Services Architecture in NYX

NYX leverages external Python services spawned via `server.ts` to extend the capabilities of the primary Node.js backend. These services act as specialized, self-contained microservices running locally to perform heavy AI inference, prompt processing, and web scraping—tasks that the Python ecosystem excels at.

## 1. Scrapling (`scrapling_server.py`)

**Port:** 3002 (Default)
**Purpose:** Web Search and Content Scraping

The Scrapling service is the core intelligence gatherer for the AI agent. It allows the agent to break out of its training data cutoff and fetch real-time context.

### Key Capabilities

- **DuckDuckGo Search (`ddgs`)**: Performs real-time search queries based on the agent's contextual requests.
- **HTML Parsing & Scraping (`scrapling` & `html2text`)**: Connects to target URLs, bypasses basic bot protections using `curl_cffi` / `browserforge`, and parses dense HTML trees into clean markdown using `html2text`.

### Integration Flow

1. The frontend invokes `gatherSearchContext` via the `useChatPipeline.ts` React hook.
2. The agent determines if a query needs search context.
3. A REST POST request is sent to `http://127.0.0.1:3002`.
4. Scrapling returns the top web results directly injected into the LLM context window.

### Fallback & Resilience

If Scrapling fails to bind to Port 3002 (due to a conflict) or the process dies:

- `server.ts` catches the `EADDRINUSE` error and prevents a startup crash-loop.
- The UI gracefully switches the Scrapling health badge to **Offline**.
- The `withRetry` hook in `useChatPipeline.ts` traps connection errors and allows the LLM to proceed responding purely from its local knowledge base, preventing the generation pipeline from hanging.

---

## 2. Antigravity SDK (`antigravity_service.py`)

**Port:** 3003 (Default)
**Purpose:** Prompt Preprocessing and Hardware Acceleration

The Antigravity service is a FastAPI application that acts as a prompt preprocessing middleware.

### Key Capabilities

- **google-generativeai Interfacing**: When available, it uses the official Google Generative AI Python SDK to perform advanced tokenization, filtering, or preprocessing before prompts hit the main LLM pipeline.
- **Hardware Agnostic**: Designed to cleanly separate Python-heavy ML libraries from the Node.js Fastify web server, keeping the V8 heap clean.

### Fallback & Resilience

- If the `google-genai` pip package is not installed, the service gracefully degrades: `HAS_GENAI = False`.
- Preprocessing steps are bypassed, and standard instruction sets are passed back to the Node.js backend.
- Like Scrapling, it features strict `EADDRINUSE` checks on startup, preventing Node from repeatedly killing and restarting the process if the port is already occupied.

---

## Technical Details

### Python Path Resolution

NYX uses a highly robust path resolution algorithm (`findPythonPath` in `server/lib/paths.ts`) to locate the active Python interpreter. It checks:

1. `NYX_PYTHON_PATH` environment variable.
2. Default OS commands (`python`, `python3`, `py`).
3. Conda/Miniconda environments in `~/.conda` and `~/miniconda3`.
4. Workspace `.vscode/settings.json` for custom `python.defaultInterpreterPath`.

### Node.js Requirements

The health check system utilizes the native global `fetch` API. This is why NYX mandates **Node.js 20.0.0+** in `package.json`, eliminating the need for `node-fetch` or `axios` polyfills.
