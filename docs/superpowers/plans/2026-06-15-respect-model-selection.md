# Swarm Model Selection & Fallback Routing Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the chat agent respects the user's selected model by resolving hardcoded model selections in `AgentOrchestrator.ts` and preventing the `SmartRouter` from silently overriding explicit user choices.

**Architecture:** 
1. Modify `SmartRouter.route` in `router.ts` to prioritize the primary user-selected model if it has a valid API key and is healthy, rather than overriding it based purely on cost/latency scores.
2. Modify `AgentOrchestrator.ts` to use the user-selected model (`context.model`) for the Supervisor CEO agent, memory compression, and worker subagents, rather than unconditionally forcing `gemini-2.5-flash`.

**Tech Stack:** TypeScript, Fastify, Gemini 2.5 API.

---

### Task 1: Update SmartRouter to Prioritize Primary Model

**Files:**
- Modify: `apps/server/server/lib/router.ts:24-76`

- [ ] **Step 1: Open [router.ts](file:///e:/NYX/apps/server/server/lib/router.ts) and locate the `route` method.**
- [ ] **Step 2: Update the `route` method to return the primary candidate directly if it has an API key and is healthy.**
  
  ```typescript
  async route(prompt: string, config: RouterConfig, apiKeys: Record<string, string> = {}): Promise<RoutingDecision> {
    const primaryModel = config.primary;
    const primaryKey = apiKeys[primaryModel.provider] || '';
    const primaryHealth = this.providerHealth.get(primaryModel.provider);
    
    const isPrimaryDown = primaryHealth?.status === 'down' && Date.now() - primaryHealth.lastChecked < 60000;
    const hasPrimaryKey = !!primaryKey || primaryModel.provider === 'pollinations' || primaryModel.provider === 'ollama' || primaryModel.provider === 'lmstudio';
    
    if (hasPrimaryKey && !isPrimaryDown) {
      return {
        provider: primaryModel.provider,
        modelId: primaryModel.id,
        apiKey: primaryKey,
        estimatedCost: this.estimateCost(primaryModel, prompt),
        estimatedLatency: primaryHealth?.avgLatency || this.estimateLatency(primaryModel),
        confidence: 1.0
      };
    }

    const candidates = [config.primary, ...config.fallbacks];
    // ... [rest of fallback scoring logic]
  ```

---

### Task 2: Remove Hardcoded gemini-2.5-flash in AgentOrchestrator

**Files:**
- Modify: `apps/server/server/features/agents/AgentOrchestrator.ts`

- [ ] **Step 1: Open [AgentOrchestrator.ts](file:///e:/NYX/apps/server/server/features/agents/AgentOrchestrator.ts) and locate `subagentContext` in `orchestrateSupervisor`.**
  Update it to use `context.model` instead of overriding it to `gemini-2.5-flash`:
  ```typescript
    const subagentContext = {
      ...context,
      model: context.model
    };
  ```

- [ ] **Step 2: Locate the Supervisor CEO `executeStream` call in `orchestrateSupervisor`.**
  Update the provider and model parameters to use `context.provider` and `context.model` instead of hardcoding `gemini` and `gemini-2.5-flash`:
  ```typescript
      await new Promise<void>((resolve, reject) => {
        UnifiedEngine.executeStream(
          {
            provider: context.provider,
            model: context.model,
            messages: supervisorMessages,
            apiKey: context.apiKey,
            settings: {
              temperature: 0.0,
              maxTokens: 1000,
              antigravity: false,
              jsonMode: true,
              jsonSchema: ledgerSchema
            }
          },
          (chunk: any) => { routingPlanRaw += chunk.chunk || ''; },
          () => resolve()
        ).catch(reject);
      });
  ```

- [ ] **Step 3: Locate the memory compression `executeStream` call in `compressMemory`.**
  Update the provider and model parameters to use `context.provider` and `context.model` instead of hardcoding `gemini` and `gemini-2.5-flash`:
  ```typescript
      await new Promise<void>((resolve, reject) => {
        UnifiedEngine.executeStream(
          {
            provider: context.provider,
            model: context.model,
            messages: compressionMessages,
            apiKey: context.apiKey,
            settings: { temperature: 0.1, maxTokens: 2048, antigravity: false }
          },
          (chunk: any) => { if (chunk.chunk) compressed += chunk.chunk; },
          () => resolve()
        ).catch(reject);
      });
  ```

---

### Task 3: Verification and Validation

- [ ] **Step 1: Verify monorepo type compliance**
  Run: `npx tsc --noEmit` under `apps/server` and ensure it completes with no compiler errors.
- [ ] **Step 2: Run tests**
  Run: `npx vitest run` and confirm all tests pass.
