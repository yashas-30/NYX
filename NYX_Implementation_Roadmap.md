# NYX Implementation Roadmap
## The Universal AI Client Vision

**Version:** 3.0 → 4.0  
**Date:** June 2025  
**Author:** NYX Dev Team  
**Status:** Implementation Plan

---

## 0. The Vision (Clarified)

**NYX is NOT an AI model company.** NYX is a **premium AI client** that lets users:
- Choose any model (Claude, Kimi, GPT, DeepSeek, Gemini, local GGUF)
- Pay the model provider directly (no NYX subscription)
- Get the same UX experience as Claude.ai or Kimi.ai
- Run everything locally with privacy-first design
- Use advanced agentic features across ALL models

**The goal:** When a user opens NYX and selects "Claude 4 Sonnet," the experience should feel as good as (or better than) claude.ai. When they select "Kimi K2.5," it should feel as good as kimi.ai. When they select a local model, it should feel like a premium desktop AI app.

---

## 1. Executive Summary: What "Same Experience" Actually Means

Claude.ai and Kimi.ai are not just chat UIs. They are **complete AI workspaces** with:

| Dimension | What Claude/Kimi Do | What NYX Must Do |
|-----------|-------------------|------------------|
| **Chat** | Streaming, artifacts, tool use, reasoning | ✅ Already strong |
| **Projects** | Persistent knowledge bases with files | ❌ Missing entirely |
| **Agent Loop** | Multi-step tool execution with reasoning | ⚠️ Partial (1 agent, 10 tools) |
| **Agent Swarm** | Parallel sub-agents for complex tasks | ❌ Missing entirely |
| **Code/IDE** | Deep codebase editing (Claude Code, Kimi Code) | ❌ Missing entirely |
| **Documents** | Generate DOCX, PPTX, XLSX natively | ❌ Missing entirely |
| **Image** | Generate and edit images | ❌ Missing entirely |
| **Plugins** | Third-party tool extensions | ❌ Missing entirely |
| **Voice** | Real-time voice conversations | ⚠️ Partial (browser STT/TTS) |
| **Context** | 200K+ token memory, project awareness | ⚠️ Partial (chat sessions only) |
| **Mobile** | Native apps for on-the-go AI | ❌ Missing entirely |
| **Collaboration** | Share projects, team workspaces | ❌ Missing entirely |

---

## 2. The 5-Phase Roadmap

### Phase 1: Foundation Cleanup (Week 1-2)
**Goal:** Remove the fake features, fix the broken infrastructure, and prepare the foundation.

| # | Task | Description | Impact |
|---|------|-------------|--------|
| 1.1 | **Remove 21 Stub Directories** | Delete `autonomous/`, `documents/`, `multimodal/`, `git/`, `sandbox/`, `audio/`, `plugins/`, `marketplace/`, `deploy/`, `projects/`, `automation/`, `debug/`, `privacy/`, `safety/`, `compliance/`, `gamification/`, `support/`, `team/`, `auth/`, `research/`, `collaboration/` — or replace with real code | 🔴 Critical — these make the app look broken |
| 1.2 | **Fix TypeScript Errors** | The codebase has ~300+ TypeScript errors. Fix them to enable reliable development | 🔴 Critical — broken types block everything |
| 1.3 | **Unify ActiveMode Types** | `activeMode` is typed differently in `router.tsx`, `AppDashboard.tsx`, `useDashboardState.ts`, and `CommandPalette.tsx`. Create a single source of truth | 🔴 Critical — causes bugs when adding features |
| 1.4 | **Fix the Backend Server** | The server has broken imports and missing routes. Ensure `/api/v1/health` returns 200, routes are properly wired | 🔴 Critical — the app is currently server-less |
| 1.5 | **Remove Dead Code** | The `orchestrator/` feature has a beautiful UI but uses a mock LLM. Either wire it to the real AIService or remove it | 🟡 Medium — confusing for users |
| 1.6 | **Fix Model Registry** | The model hub only has 2 hardcoded models with dummy checksums. Connect to real HuggingFace/Ollama API or at least a proper catalog | 🟡 Medium — users can't download models |

**Deliverable:** Clean, buildable codebase with no TypeScript errors, no stub features in the UI, and a working backend.

---

### Phase 2: Core UX Improvements (Week 3-4)
**Goal:** Make the chat experience feel as good as Claude.ai and Kimi.ai. This is the foundation everything else builds on.

| # | Task | Description | Impact |
|---|------|-------------|--------|
| 2.1 | **Artifact System v2** | Claude's artifact system is the gold standard. NYX has a basic canvas. Improve it:  <br>- Auto-detect code blocks, HTML, React, Python in responses <br>- Render artifacts in dedicated side panel (not inline) <br>- Allow artifact versioning (edit → new version) <br>- Add artifact fork/save/export | 🔴 Critical — this is what makes Claude feel "smart" |
| 2.2 | **Projects / Knowledge Bases** | Claude has "Projects" — persistent folders with uploaded files, custom instructions, and project-scoped chat history. Implement:  <br>- Create project (folder + name + description) <br>- Upload files (PDF, DOCX, images, code) to project  <br>- Project-scoped chat sessions (all chats in a project share the project context) <br>- Custom instructions per project <br>- Project search (semantic search across all project files) | 🔴 Critical — this is the #1 feature Claude users love |
| 2.3 | **Reasoning / Thinking Blocks** | Claude shows "thinking" blocks when reasoning. Kimi shows "Thinking" mode. Implement:  <br>- Collapsible reasoning blocks in the UI <br>- Token count for reasoning vs output <br>- Option to show/hide reasoning <br>- Thinking time indicator | 🔴 Critical — users expect to see the AI's reasoning |
| 2.4 | **Citation System** | When using web search or RAG, show inline citations like [1], [2] with hover cards showing the source. Claude does this beautifully | 🔴 Critical — builds trust in AI responses |
| 2.5 | **Message Branching v2** | NYX has basic branching. Improve it:  <br>- Visual tree view of conversation branches <br>- Compare two branches side-by-side <br>- Merge branches (take the best parts from each) | 🟡 Medium — differentiator feature |
| 2.6 | **Context Window Indicator** | Show a visual indicator of how much context is used (e.g., "12,450 / 128,000 tokens"). Kimi does this well. Warn when approaching limits | 🟡 Medium — helps users manage long conversations |
| 2.7 | **Chat Export & Sharing v2** | Improve export:  <br>- Export as beautiful HTML with syntax highlighting <br>- Share via link with expiration (NYX hosted) <br>- Export to Notion, Obsidian, GitHub Gist | 🟢 Low — nice to have |
| 2.8 | **Mobile-Responsive Polish** | The current UI breaks on mobile. Fix:  <br>- Sidebar collapses properly on mobile  <br>- Chat input stays visible when keyboard opens <br>- Touch-friendly message actions | 🟡 Medium — many users want mobile web |

**Deliverable:** Chat experience that feels as polished as Claude.ai when using any model.

---

### Phase 3: Agent & Tool System (Week 5-7)
**Goal:** Build the agentic layer that makes NYX more than just a chat app. This is where you compete with Claude Code and Kimi Agent Swarm.

| # | Task | Description | Impact |
|---|------|-------------|--------|
| 3.1 | **Real Multi-Agent Swarm** | Replace the stub `autonomous/` with real parallel execution:  <br>- Task decomposition: break a complex prompt into subtasks <br>- Spawn 3-5 parallel agents each working on a subtask <br>- Result aggregator: combine all sub-results into a coherent final response <br>- Visual execution graph: show which agents are running, completed, failed <br>- Support for: parallel research, parallel code review, parallel data analysis | 🔴 Critical — Kimi's Agent Swarm is their main differentiator |
| 3.2 | **Tool System v2** | NYX has 10 tools. Expand to 20+ tools and make them first-class:  <br>- **File tools**: read_file, write_file, edit_file, list_directory, grep_search, diff_files <br>- **Web tools**: web_search, web_browse, fetch_page, web_scrape <br>- **Code tools**: run_python, run_javascript, run_shell, run_test, lint_code <br>- **System tools**: get_system_info, take_screenshot, run_mcp_tool, schedule_task <br>- **Document tools**: read_pdf, read_docx, create_presentation, create_spreadsheet <br>- **Image tools**: generate_image, analyze_image, edit_image <br>- Tool approval UI: ask user before destructive actions (write, delete) | 🔴 Critical — the tool ecosystem is what makes agents useful |
| 3.3 | **MCP Ecosystem Integration** | The Model Context Protocol (MCP) is becoming the standard for AI tools. Implement:  <br>- MCP server discovery and installation (browse community servers) <br>- MCP server configuration (env vars, args) <br>- MCP tool execution through the agent loop <br>- Support for stdio and SSE transport <br>- Built-in MCP servers: filesystem, web search, browser, GitHub, Slack | 🔴 Critical — MCP is the future of AI tool integration |
| 3.4 | **Plugin System** | Replace the stub `plugins/` with a real plugin architecture:  <br>- Plugin manifest (name, version, tools, hooks, permissions) <br>- Plugin installation from URL or local file <br>- Plugin sandbox (isolated execution) <br>- Plugin marketplace UI (browse, install, rate) <br>- Plugin API: registerTool, registerHook, onChatStart, onMessage, onToolCall <br>- Starter plugins: Calculator, Weather, Stock Price, Calendar, Email | 🔴 Critical — enables community extensibility |
| 3.5 | **Long-Term Memory** | NYX currently has no memory across sessions. Implement:  <br>- Automatic memory extraction: after each conversation, extract key facts, preferences, decisions <br>- Memory store: vector database (use existing SQLite + vector extension) <br>- Memory retrieval: relevant memories are injected into context automatically <br>- Memory management UI: view, edit, delete memories <br>- User preference learning: model choice, tone, formatting preferences | 🟡 Medium — makes the AI feel like it "knows you" |
| 3.6 | **Computer Use / Vision Control** | Claude's Computer Use lets the AI control your computer. Implement:  <br>- Screenshot capture (desktop or specific window) <br>- Vision-based UI understanding (send screenshot to vision model) <br>- Mouse/keyboard control via Tauri (already partially there) <br>- Task automation: "Open Chrome, go to GitHub, create a PR" | 🟡 Medium — powerful but complex |
| 3.7 | **Browser Automation** | Deep browser control for web tasks:  <br>- Navigate to URL, click elements, fill forms, extract data <br>- Playwright-like control via Tauri <br>- Session persistence (cookies, login state) <br>- Visual browser overlay (show what the AI is doing) | 🟡 Medium — enables web-based agent tasks |

**Deliverable:** Agent system that can handle complex multi-step tasks across any model, with a rich tool ecosystem and plugin architecture.

---

### Phase 4: Developer & Productivity Features (Week 8-10)
**Goal:** Make NYX the best tool for developers, knowledge workers, and creatives. This is where you compete with Claude Code, Cursor, and Kimi Code.

| # | Task | Description | Impact |
|---|------|-------------|--------|
| 4.1 | **VS Code Extension** | This is the #1 requested feature for AI coding tools. Build:  <br>- VS Code extension that connects to NYX backend <br>- Inline chat in editor (Cmd+I like Cursor) <br>- Code generation, editing, refactoring inline <br>- Diff preview with accept/reject <br>- File tree awareness (NYX knows your project structure) <br>- Terminal integration (run commands from chat) <br>- Git integration (show diffs, commit suggestions) | 🔴 Critical — this is what makes Claude Code and Kimi Code valuable |
| 4.2 | **Git Integration** | Replace the stub `git/` with real Git features:  <br>- Git status panel (modified files, branch, commit history) <br>- Diff viewer (side-by-side or inline) <br>- Commit message generation from diff <br>- PR description generation <br>- Branch creation/switching <br>- Git blame in file viewer <br>- Commit graph visualization | 🔴 Critical — developers need Git integration |
| 4.3 | **Document Generation** | Replace the stub `documents/` with real document creation:  <br>- **DOCX**: Generate Word documents with formatting, images, tables (use `docx.js` library) <br>- **PPTX**: Generate PowerPoint presentations with slides, charts, animations (use `pptxgenjs`) <br>- **XLSX**: Generate Excel spreadsheets with formulas, charts, pivot tables (use `xlsx` or `SheetJS`) <br>- **PDF**: Generate PDFs with LaTeX support (use `pdfmake` or `puppeteer`) <br>- Template system: choose from templates (report, resume, proposal) <br>- Export chat directly to any format | 🔴 Critical — Kimi's Office productivity is a major differentiator |
| 4.4 | **Image Generation & Editing** | Replace the stub `multimodal/` with real image features:  <br>- **Generation**: Integrate DALL-E 3, Stable Diffusion, Pollinations, or Imagen <br>- **Gallery**: Browse generated images, save favorites, export <br>- **Editing**: Inpainting, outpainting, style transfer (use existing APIs) <br>- **Vision**: Send images to any vision-capable model for analysis <br>- **Batch processing**: Generate multiple variations at once | 🟡 Medium — not core for all users, but expected |
| 4.5 | **Local Sandbox** | Replace the stub `sandbox/` with a real code execution environment:  <br>- Docker-based sandbox for running untrusted code <br>- Python execution with pip install support <br>- JavaScript/Node.js execution <br>- Sandboxed file system (no access to host) <br>- Output capture (stdout, stderr, files) <br>- Timeout and resource limits | 🟡 Medium — enables safe code execution |
| 4.6 | **Scheduled Tasks / Cron** | Replace the stub `automation/` with real automation:  <br>- Task scheduler: create recurring tasks (daily reports, monitoring) <br>- Cron expression builder UI <br>- Task execution history and logs <br>- Trigger types: cron, webhook, event-based <br>- Task templates: morning briefing, code review, research digest | 🟡 Medium — makes NYX a persistent assistant |
| 4.7 | **Infinite Canvas v2** | The current workspace is a navigation button. Make it real:  <br>- Infinite scroll canvas (like Figma, Miro, Obsidian Canvas) <br>- Add nodes: text, code, image, web page, mind map <br>- Connect nodes with arrows <br>- AI-assisted canvas: "Summarize this into a mind map" <br>- Export canvas as image or interactive HTML | 🟡 Medium — creative thinking tool |
| 4.8 | **Voice Conversations v2** | Improve the existing voice system:  <br>- Real-time voice streaming (not just STT then TTS) <br>- Interruptible AI (user can interrupt mid-sentence) <br>- Voice activity detection (better turn-taking) <br>- Multiple voice personas (choose voice style) <br>- Voice-only mode (hide UI, voice only) | 🟡 Medium — accessibility and convenience |

**Deliverable:** NYX becomes a complete productivity and development workspace, not just a chat app.

---

### Phase 5: Platform & Ecosystem (Week 11-14)
**Goal:** Make NYX a platform that users can rely on for daily work, with sharing, collaboration, and cross-platform support.

| # | Task | Description | Impact |
|---|------|-------------|--------|
| 5.1 | **Collaborative Sessions** | Share a chat session with others via link:  <br>- Real-time collaboration (WebRTC or WebSocket) <br>- Cursor presence (see where others are typing) <br>- Comment threads on messages <br>- Permission levels (view, comment, edit) <br>- Session recording and playback | 🟡 Medium — team collaboration |
| 5.2 | **Team Workspaces** | Multi-user support for teams:  <br>- Team workspace with shared projects <br>- Shared model settings and API keys (team-level) <br>- Usage analytics (who used what model, how many tokens) <br>- Admin controls (user management, permissions) <br>- Shared prompt library and templates | 🟡 Medium — enterprise appeal |
| 5.3 | **Mobile App (React Native / Capacitor)** | Wrap the web app for mobile:  <br>- iOS and Android apps <br>- Push notifications for scheduled tasks <br>- Voice-first mobile interface <br>- Offline mode (local model only) <br>- Share sheet integration (share to NYX from any app) | 🟡 Medium — platform reach |
| 5.4 | **Browser Extension** | Chrome/Firefox extension:  <br>- Summarize any webpage in one click <br>- "Ask NYX about this page" from context menu <br>- Highlight text and ask questions <br>- Save web pages to NYX projects <br>- Quick chat popup from toolbar | 🟢 Low — convenience feature |
| 5.5 | **Cloud Sync (Optional)** | Encrypted cloud backup for users who want it:  <br>- End-to-end encrypted sync of sessions, projects, settings <br>- Cross-device access (work on desktop, continue on phone) <br>- Optional self-hosted sync server (for privacy) <br>- No cloud required (works fully offline) | 🟡 Medium — cross-device experience |
| 5.6 | **Community Marketplace** | Platform for community content:  <br>- Prompt templates marketplace (share and discover) <br>- Agent recipes (pre-built agent configurations) <br>- Plugin marketplace (discover and install plugins) <br>- Project templates (starter projects for different domains) <br>- Ratings, reviews, and curation | 🟢 Low — ecosystem growth |
| 5.7 | **API for Developers** | Let developers build on top of NYX:  <br>- REST API for chat, projects, agents <br>- WebSocket for real-time streaming <br>- SDK for plugin development <br>- Webhook support for events | 🟢 Low — developer ecosystem |
| 5.8 | **Documentation & Onboarding** | Claude and Kimi have excellent onboarding:  <br>- Interactive tutorial for first-time users <br>- Feature discovery (highlight new features) <br>- Video tutorials and documentation site <br>- Community Discord/forum <br>- In-app help system with AI assistant | 🟢 Low — user retention |

**Deliverable:** NYX is a complete platform with multi-user support, cross-platform access, and a thriving community ecosystem.

---

## 3. Detailed Implementation Order (What to Build First)

### Priority 1: Do These First (Weeks 1-4)

These are the features that make NYX feel like a premium AI client:

1. **Projects / Knowledge Bases** — This is the #1 feature that separates Claude/Kimi from basic chat apps. Users want to upload files, create persistent workspaces, and have the AI remember project context. **Build this first.**

2. **Artifact System v2** — Claude's artifact panel is iconic. Users expect code blocks to render as runnable previews, HTML to show as actual pages, and data to show as charts. **Build this second.**

3. **Tool System v2 + MCP** — Expand from 10 tools to 20+ and add MCP support. This makes the agent loop actually useful. **Build this third.**

4. **Reasoning / Thinking Blocks** — Users want to see the AI's chain of thought. This builds trust and is expected behavior. **Build this fourth.**

### Priority 2: Do These Next (Weeks 5-8)

These differentiate NYX from other AI clients:

5. **Multi-Agent Swarm** — Parallel execution is the future. Kimi does this well. This makes NYX handle complex tasks that single agents can't. **Build this fifth.**

6. **VS Code Extension** — Developers are your core audience. This is what makes Cursor and Claude Code valuable. **Build this sixth.**

7. **Plugin System** — Community extensibility is how platforms grow. This enables infinite tools without you building them all. **Build this seventh.**

8. **Document Generation (DOCX, PPTX, XLSX)** — Kimi's office productivity is a huge differentiator. This makes NYX a business tool. **Build this eighth.**

### Priority 3: Do These After (Weeks 9-14)

These are nice-to-have but not critical:

9. **Git Integration** — Important for developers but less critical than the IDE extension.
10. **Image Generation** — Popular but not core to the AI client experience.
11. **Scheduled Tasks** — Useful for automation but not a core chat feature.
12. **Mobile App** — Expands reach but the web app should be mobile-first already.
13. **Collaboration / Team** — Enterprise feature, not needed for solo users.
14. **Community Marketplace** — Ecosystem feature, build after you have users.

---

## 4. What Makes Claude.ai Feel Good (And How to Replicate It)

### 4.1 The "Warm" UX
- **Claude's cream canvas** — NYX already has a beautiful dark theme. Consider adding a warm light theme option (like Claude's #faf9f5)
- **Generous whitespace** — Claude uses 96px between sections. NYX feels more cramped. Increase spacing.
- **Serif headlines** — Claude uses serif for headlines. This gives a literary feel. Consider adding a serif font option for headlines.
- **Minimal shadows** — Claude uses color-block depth, not drop shadows. NYX's glassmorphism is nice but can feel heavy.

### 4.2 The "Smart" Behaviors
- **Artifacts auto-detect** — When Claude sees code, it creates an artifact. NYX should do this automatically.
- **Thinking blocks** — Claude shows reasoning in collapsible blocks. This is expected now.
- **Inline citations** — When Claude searches the web, it cites sources with [1], [2]. NYX should do this.
- **Context awareness** — Claude remembers project context. NYX's projects feature needs this.
- **Natural follow-ups** — Claude suggests follow-up questions. NYX should too.

### 4.3 The "Fast" Performance
- **Instant streaming** — Claude starts responding immediately. NYX already has good streaming.
- **No loading states** — Claude rarely shows spinners. Responses flow in naturally.
- **Smooth animations** — Claude's message appear animations are subtle but smooth. NYX's Framer Motion is good but can be optimized.
- **Keyboard-first** — Claude is fully keyboard-navigable. NYX has command palette but could go further.

### 4.4 The "Trustworthy" Feelings
- **Clear model indicators** — Claude always shows which model you're using. NYX does this well.
- **Usage transparency** — Claude shows token count and context usage. NYX should add this.
- **Safety explanations** — Claude explains when it refuses something. NYX should too.
- **Data privacy** — Claude emphasizes privacy. NYX's privacy mode is good but could be more prominent.

---

## 5. What Makes Kimi.ai Feel Good (And How to Replicate It)

### 5.1 The "Long Context" Experience
- **Massive file uploads** — Kimi handles 50+ files at once. NYX's RAG should support this.
- **Document understanding** — Kimi can read PDFs, spreadsheets, and images natively. NYX needs document parsing.
- **Context indicator** — Kimi shows a clear token usage indicator. NYX should add this.

### 5.2 The "Agent Swarm" Power
- **Parallel execution** — Kimi shows multiple agents working simultaneously. This is visually impressive and functionally powerful.
- **Task decomposition** — Kimi automatically breaks down complex tasks. NYX's agent loop should do this.
- **Result aggregation** — Kimi combines parallel results into a coherent answer. This is the hard part of swarms.

### 5.3 The "Office Productivity" Suite
- **One-click document generation** — Kimi generates PPT, DOCX, XLSX from a single prompt. This is magical for business users.
- **Presentation mode** — Kimi can generate slide decks with proper formatting. NYX needs this.
- **Spreadsheet intelligence** — Kimi generates Excel files with formulas and charts. NYX needs this.

### 5.4 The "Kimi Work" Platform
- **Persistent agents** — Kimi Work runs agents that persist across sessions. NYX's scheduled tasks should enable this.
- **Skills system** — Kimi Work has reusable skills. NYX's plugin system should enable this.
- **Scheduled execution** — Kimi Work runs tasks on a schedule. NYX's cron system should enable this.

---

## 6. Technical Architecture Decisions

### 6.1 Store Architecture
Currently: Zustand with persist middleware. **Keep this.** It's working well.

Add new stores:
- `useProjectStore.ts` — Projects, files, knowledge bases
- `useSwarmStore.ts` — Agent swarm execution state
- `usePluginStore.ts` — Installed plugins, tool registry
- `useToolStore.ts` — Tool execution history, pending approvals
- `useMcpStore.ts` — MCP server configurations
- `useMemoryStore.ts` — Long-term memory extraction
- `useTaskStore.ts` — Scheduled tasks, cron jobs

### 6.2 Service Architecture
Currently: Services in `core/services/`. **Keep this pattern.**

Add new services:
- `project.service.ts` — Project CRUD, file upload, semantic search
- `swarm.service.ts` — Task decomposition, parallel execution, aggregation
- `plugin.service.ts` — Plugin install, enable/disable, sandbox execution
- `mcp.service.ts` — MCP server lifecycle, tool discovery
- `document.service.ts` — DOCX, PPTX, XLSX generation
- `image.service.ts` — Image generation via DALL-E, Stable Diffusion, etc.
- `git.service.ts` — Git status, diff, branch, commit operations
- `sandbox.service.ts` — Docker/container execution
- `task.service.ts` — Cron scheduling, task execution

### 6.3 Backend Architecture
Currently: Fastify server with minimal features. **Expand it.**

Add new backend modules:
- `server/routes/projects.ts` — Project API endpoints
- `server/routes/documents.ts` — Document generation endpoints
- `server/routes/images.ts` — Image generation proxy endpoints
- `server/routes/git.ts` — Git operations endpoints
- `server/routes/mcp.ts` — MCP server management endpoints
- `server/routes/tasks.ts` — Scheduled task endpoints
- `server/lib/vectorstore.ts` — Vector database for RAG and memory
- `server/lib/sandbox.ts` — Docker sandbox manager
- `server/lib/scheduler.ts` — Cron-like task scheduler

### 6.4 Plugin Architecture
Design a plugin system that is simple but powerful:

```typescript
// Plugin manifest
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  permissions: string[];
  tools: PluginTool[];
  hooks: PluginHook[];
}

// Plugin tool
interface PluginTool {
  name: string;
  description: string;
  parameters: JSONSchema;
  handler: (params: any) => Promise<any>;
}

// Plugin hook
interface PluginHook {
  event: 'chat:start' | 'message:send' | 'message:receive' | 'tool:call';
  handler: (context: any) => Promise<any>;
}
```

Plugins run in a Web Worker sandbox for security. They communicate via message passing.

### 6.5 MCP Architecture
Follow the Model Context Protocol standard:

- Support both `stdio` (local process) and `sse` (HTTP server) transports
- Use the official MCP SDK (`@modelcontextprotocol/sdk`)
- Store MCP server configs in the Zustand store (persisted)
- Auto-discover tools from connected MCP servers
- Show MCP server status in the UI (connected, disconnected, error)

---

## 7. The "Claude/Kimi Response Quality" Problem

Here's the hard truth: **NYX cannot make a cheap model produce responses as good as Claude 4 or Kimi K2.5.** Response quality depends on:

1. **The model itself** — Claude 4 and Kimi K2.5 are trained on trillions of tokens with advanced alignment techniques. You cannot replicate this without training your own model.
2. **System prompts** — Claude and Kimi have carefully crafted system prompts that shape their personality, reasoning, and output style. NYX can improve system prompts but not replicate years of fine-tuning.
3. **Context management** — Claude and Kimi have sophisticated context management (summarization, compaction, attention mechanisms). NYX can approximate this but not replicate it.
4. **Tool use training** — Claude and Kimi are trained specifically to use tools effectively. NYX can improve tool prompting but the model's inherent tool use capability depends on the model.

### What NYX CAN Do to Improve Response Quality:

| Technique | How It Works | Impact |
|-----------|-------------|--------|
| **Better system prompts** | Craft detailed system prompts for each model that match the task | Medium |
| **Chain-of-thought prompting** | Automatically prepend "Let's think step by step" for reasoning tasks | Medium |
| **Tool use examples** | Include few-shot examples of tool use in the system prompt | Medium |
| **Context enrichment** | Automatically add relevant project files, memories, and previous context | High |
| **Response post-processing** | After the model responds, run a "refiner" agent to improve formatting, fix errors, add citations | Medium |
| **Model routing** | Automatically route complex tasks to more capable models (Claude 4) and simple tasks to faster models (Haiku) | High |
| **Multi-model consensus** | For critical tasks, query multiple models and take the consensus answer | Medium |
| **Retrieval augmentation** | Always augment the prompt with relevant documents from the project knowledge base | High |

### Recommended Strategy:
- **For users who want Claude-quality responses**: They should use the Claude API through NYX. NYX provides the UX, Claude provides the intelligence. This is the correct model.
- **For users who want Kimi-quality responses**: They should use the Kimi API through NYX.
- **For users who want local/free**: Use local models with the understanding that quality is lower. NYX's context enrichment and tool system can help bridge the gap.
- **NYX's value add**: The UX, the tool system, the projects, the agent swarm, the plugin ecosystem — NOT the model itself.

---

## 8. Implementation Checklist by Phase

### Phase 1: Foundation Cleanup (Week 1-2)

- [ ] Delete 21 stub directories or replace with real code
- [ ] Fix all TypeScript errors (target: 0 errors)
- [ ] Unify activeMode types across all files
- [ ] Fix backend server routes and imports
- [ ] Remove or fix the mock orchestrator
- [ ] Fix model registry with real catalog
- [ ] Add Prettier/ESLint to CI/CD
- [ ] Write unit tests for critical paths (chat, streaming, agent loop)

### Phase 2: Core UX (Week 3-4)

- [ ] Implement Projects feature with file upload, custom instructions, project-scoped chats
- [ ] Implement Artifact System v2 (side panel, versioning, auto-detect)
- [ ] Implement Reasoning / Thinking Blocks (collapsible, token count)
- [ ] Implement Citation System (inline citations with hover cards)
- [ ] Implement Message Branching v2 (tree view, compare, merge)
- [ ] Implement Context Window Indicator (visual bar, warnings)
- [ ] Implement Chat Export v2 (HTML, Notion, Obsidian)
- [ ] Fix mobile responsiveness (sidebar, keyboard, touch targets)
- [ ] Add warm light theme option (Claude-style cream canvas)
- [ ] Add keyboard shortcuts documentation

### Phase 3: Agent System (Week 5-7)

- [ ] Implement Multi-Agent Swarm (task decomposition, parallel execution, aggregation)
- [ ] Expand tool system to 20+ tools (file, web, code, system, document, image)
- [ ] Implement MCP Ecosystem (server discovery, install, config, execution)
- [ ] Implement Plugin System (manifest, install, sandbox, marketplace, API)
- [ ] Implement Long-Term Memory (extraction, vector store, retrieval, management UI)
- [ ] Implement Computer Use / Vision Control (screenshots, mouse/keyboard)
- [ ] Implement Browser Automation (navigate, click, extract, session)
- [ ] Add tool approval UI (ask before destructive actions)

### Phase 4: Developer & Productivity (Week 8-10)

- [ ] Implement VS Code Extension (inline chat, diff, terminal, git)
- [ ] Implement Git Integration (status, diff, branches, commits, blame)
- [ ] Implement Document Generation (DOCX, PPTX, XLSX, PDF, templates)
- [ ] Implement Image Generation & Editing (DALL-E, SD, gallery, editing)
- [ ] Implement Local Sandbox (Docker, Python, JS, safe execution)
- [ ] Implement Scheduled Tasks / Cron (scheduler, history, templates)
- [ ] Implement Infinite Canvas v2 (nodes, connections, AI-assisted)
- [ ] Implement Voice Conversations v2 (real-time streaming, interrupt, personas)

### Phase 5: Platform (Week 11-14)

- [ ] Implement Collaborative Sessions (real-time, presence, comments, permissions)
- [ ] Implement Team Workspaces (shared projects, usage analytics, admin)
- [ ] Implement Mobile App (React Native/Capacitor, push notifications, voice)
- [ ] Implement Browser Extension (summarize, ask, save, quick chat)
- [ ] Implement Cloud Sync (encrypted, optional, self-hostable)
- [ ] Implement Community Marketplace (prompts, agents, plugins, templates)
- [ ] Implement API for Developers (REST, WebSocket, SDK, webhooks)
- [ ] Write documentation and onboarding (tutorials, docs site, help system)

---

## 9. Success Metrics

How do you know NYX is as good as Claude/Kimi?

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Daily Active Users** | 1,000+ in 6 months | Analytics |
| **Session Length** | 15+ minutes average | Analytics |
| **Feature Adoption** | 60% of users use Projects | Analytics |
| **Model Diversity** | 50% of users use 2+ models | Analytics |
| **User Retention** | 40% week-1 retention | Analytics |
| **Plugin Installs** | 100+ plugins in marketplace | Plugin store |
| **GitHub Stars** | 5,000+ stars | GitHub |
| **NPS Score** | 50+ | User surveys |
| **Response Satisfaction** | 85%+ positive feedback | In-app feedback |
| **Bug Reports** | <5 critical bugs per week | GitHub Issues |

---

## 10. The Bottom Line

**NYX is an AI client, not an AI model.** That is the correct positioning. The path to success is:

1. **Clean up the foundation** (remove stubs, fix types, fix backend)
2. **Build Projects** (the #1 feature that separates premium from basic)
3. **Build the Agent System** (multi-agent, tools, MCP, plugins)
4. **Build Developer Tools** (VS Code extension, Git, IDE integration)
5. **Build Productivity Tools** (documents, images, voice, canvas)
6. **Build the Platform** (mobile, collaboration, sync, community)

**The user experience should be:**
- Open NYX → Select Claude 4 → Use Projects to upload files → Chat with context-aware responses → See reasoning blocks → Use artifacts for code → All with the same polish as claude.ai
- Open NYX → Select Kimi K2.5 → Use Agent Swarm for complex tasks → Generate documents and presentations → All with the same power as kimi.ai
- Open NYX → Select a local model → Use the same UX but with privacy and zero cost → Agent tools work across all models

**This is achievable.** It requires focused execution over 3-4 months with a small team (or dedicated solo developer). The key is to NOT try to build everything at once, but to build each phase completely before moving to the next.

---

*End of Implementation Roadmap*
