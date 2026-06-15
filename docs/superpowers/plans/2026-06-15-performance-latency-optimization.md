# Swarm Performance & Latency Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce response latency and Time-to-First-Token (TTFT) of the NYX agent swarm by optimizing tool embedding calculations and introducing fast-path routing classifiers.

**Architecture:** We will implement lazy-cached tool embeddings in `AgentOrchestrator.ts` to eliminate sequential embedding API calls and add fast-path routing bypasses for common direct intents.

**Tech Stack:** TypeScript, Fastify, SQLite, Gemini 2.5 Flash API.

---

### Task 1: Implement Static Tool Embeddings Caching

Currently, `selectToolsSemantically` makes 1 embedding API call for the assigned task, and then performs an embedding API call for **every single tool description** (15 tools = 15 calls) on every agent activation. This creates a massive network bottleneck (2-5 seconds overhead). We will cache tool description embeddings in memory.

**Files:**
- Modify: `apps/server/server/features/agents/AgentOrchestrator.ts:830-890`

- [ ] **Step 1: Open [AgentOrchestrator.ts](file:///e:/NYX/apps/server/server/features/agents/AgentOrchestrator.ts) and add a private static cache for tool description embeddings.**
  Add this property to the `AgentOrchestrator` class:
  ```typescript
  private static toolEmbeddingsCache = new Map<string, number[]>();
  ```

- [ ] **Step 2: Modify `selectToolsSemantically` to fetch tool embeddings from cache or compute them lazily.**
  
  ```typescript
  private async selectToolsSemantically(agentId: string, assignedTask: string, context: any): Promise<any[]> {
    const allTools: any[] = context?.tools || [];
    if (allTools.length === 0) return [];
    if (agentId === 'persona_polisher') return [];

    // Always include core memo/state tools
    const baseTools = allTools.filter(t => ['memo_read', 'memo_write'].includes(t.function?.name));
    
    if (!assignedTask) {
      return this.getToolsForAgent(agentId, context);
    }

    try {
      // 1. Get task embedding (exactly 1 call)
      const taskEmbedding = await EmbeddingService.embedText(assignedTask, { provider: 'gemini' });
      
      // 2. Resolve tool embeddings (caching static tool signatures)
      const scoredTools = await Promise.all(allTools.map(async (t) => {
        const name = t.function?.name || '';
        const desc = `${name}: ${t.function?.description || ''}`;
        
        let toolEmbedding = AgentOrchestrator.toolEmbeddingsCache.get(name);
        if (!toolEmbedding) {
          toolEmbedding = await EmbeddingService.embedText(desc, { provider: 'gemini' });
          AgentOrchestrator.toolEmbeddingsCache.set(name, toolEmbedding);
        }
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < taskEmbedding.length; i++) {
          dotProduct += taskEmbedding[i] * toolEmbedding[i];
          normA += taskEmbedding[i] * taskEmbedding[i];
          normB += toolEmbedding[i] * toolEmbedding[i];
        }
        const score = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        return { tool: t, score };
      }));

      // Filter tools with similarity score > 0.35
      const relevantTools = scoredTools
        .filter(st => st.score > 0.35 && !['memo_read', 'memo_write'].includes(st.tool.function?.name))
        .map(st => st.tool);

      const merged = [...baseTools];
      for (const t of relevantTools) {
        if (!merged.some(m => m.function?.name === t.function?.name)) {
          merged.push(t);
        }
      }
      
      logger.info(`[SemanticToolRouter] Routed ${merged.length} tools for agent ${agentId} on task: "${assignedTask.slice(0, 50)}..."`);
      return merged;
    } catch (err: any) {
      logger.warn(`[SemanticToolRouter] Semantic matching failed (${err.message}). Using legacy fallback.`);
      return this.getToolsForAgent(agentId, context);
    }
  }
  ```

---

### Task 2: Implement Fast-Path Routing Bypasses for Direct Intents

For simple queries (e.g. searching the web or reading a file), running the Supervisor CEO agent adds a 1-2 second LLM inference penalty. We will implement regex classifiers to route direct intents directly to the specialized worker agent.

**Files:**
- Modify: `apps/server/server/features/agents/AgentOrchestrator.ts:170-195`

- [ ] **Step 1: Define regex classifiers for direct intents in `AgentOrchestrator.ts`.**
  Add these to the `AgentOrchestrator` class:
  ```typescript
  private static DIRECT_INTENTS = [
    {
      pattern: /^(?:search\s+(?:the\s+)?web\s+for|search\s+for|look\s+up|google)\s+(.+)$/i,
      agent: 'web_explorer',
      task: 'Search the web for: '
    },
    {
      pattern: /^(?:read\s+file|view\s+file|show\s+file)\s+([^\s]+)$/i,
      agent: 'doc_cruncher',
      task: 'Read the contents of file: '
    },
    {
      pattern: /^(?:review\s+code\s+in|check\s+code\s+in|review\s+file|check\s+file)\s+([^\s]+)$/i,
      agent: 'qa_reviewer',
      task: 'Review the code correctness and locate bugs in file: '
    }
  ];
  ```

- [ ] **Step 2: Check for direct intents in `orchestrateSupervisor` right after the casual checks.**
  
  ```typescript
    // ── Fast path 2: direct intents bypass orchestrator CEO ──────────────────
    for (const intent of AgentOrchestrator.DIRECT_INTENTS) {
      const match = promptMessage.match(intent.pattern);
      if (match) {
        const queryText = match[1];
        logger.info(`[Supervisor] Fast-path: direct intent matched for ${intent.agent}`);
        onChunk({ type: 'thinking', content: `\n⚡ [Fast-Path Routing] Directly invoking ${AGENT_REGISTRY[intent.agent]?.name || intent.agent}...\n` });
        
        taskLedger = [
          { agent: intent.agent, task: `${intent.task}${queryText}` },
          { agent: 'persona_polisher', task: 'Synthesize the final answer' }
        ];
        break;
      }
    }
  ```

---

### Task 3: Verification and Validation

- [ ] **Step 1: Verify monorepo type compliance**
  Run: `npx tsc --noEmit` under `apps/server` and ensure it completes with no compiler errors.
- [ ] **Step 2: Run tests**
  Run: `npx vitest run` and confirm all tests pass.
