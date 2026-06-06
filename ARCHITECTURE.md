# NYX Architecture

NYX is an open-source AI agent platform designed for high performance, local-first capabilities, and extensive tool integration.

## System Components

1. **Frontend (Vite + React + Tailwind)**
   - PWA ready with Workbox service workers for offline caching
   - Monaco Editor integrated with Yjs for real-time collaboration
   - State managed by Zustand for atomic reactivity
   - Visualizations via Mermaid and Chart.js

2. **Backend (Fastify + Node.js)**
   - Fastify provides maximum throughput for SSE streaming
   - Undici connection pooling and zero-latency DNS pre-warming
   - LanceDB for local embedded vector search
   - LangGraph for complex agentic pipelines (Planner -> Coder -> Reviewer)
   
3. **Execution Sandbox**
   - Playwright for headless browser automation and visual testing
   - Secure Workspace execution via pseudo-terminals (node-pty/xterm.js)

## Data Flow

User -> Prompt -> Intelligent Router -> Tool execution / Context aggregation -> Prompt Analyzer -> AI Service (Local / Cloud) -> SSE stream back to User.
