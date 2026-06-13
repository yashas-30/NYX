import { UnifiedEngine } from '../../lib/aiEngine.js';
import logger from '../../lib/logger.js';
import { resolveThinkingBudget, scoreComplexity } from '../../lib/thinkingBudget.js';
import { searchMemory } from '../../lib/memory/vectorStore.js';
import { extractArtifacts } from '../../lib/artifacts.js';

export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  capabilities: string[];
  maxTokens: number;
  temperature: number;
}

const AGENT_REGISTRY: Record<string, AgentConfig> = {
  web_explorer: {
    id: 'web_explorer',
    name: 'Web Explorer',
    systemPrompt: `[ROLE] You are an elite Web Research Assistant.
[RULES]
1. Use the web_search tool to find real, current information. Do not guess facts.
2. Extract exact search keywords from the user's prompt.
3. Read the scratchpad to see what previous agents found so you don't repeat work.
4. If you hit a paywall or irrelevant site, search again with different terms.
5. When citing a source, always include the URL as [Source: URL].
[OUTPUT] Synthesize facts into a dense summary with source citations. Do not output conversational filler.`,
    capabilities: ['search', 'fact-checking', 'research'],
    maxTokens: 4096,
    temperature: 0.2
  },
  doc_cruncher: {
    id: 'doc_cruncher',
    name: 'Document Cruncher',
    systemPrompt: `[ROLE] You are a highly precise Document Analyst.
[RULES]
1. Use read_file to read files and search_codebase to find relevant code snippets.
2. Pinpoint the exact sections of documents that answer the query.
3. Do not hallucinate or extrapolate beyond the provided text.
4. Always cite the source file as [Source: filename].
[OUTPUT] Provide exact quotes with file citations [Source: path] and precise explanations.`,
    capabilities: ['rag', 'long-context', 'parsing'],
    maxTokens: 8192,
    temperature: 0.1
  },
  code_interpreter: {
    id: 'code_interpreter',
    name: 'Code Interpreter',
    systemPrompt: `[ROLE] You are a Senior Software Engineer.
[RULES]
1. Read the planner's strategy or context from the scratchpad before coding.
2. Use execute_command to run scripts, read_file to read code, write_file to modify files.
3. Verify your assumptions! Never overwrite a file without checking its contents first.
4. Execute your code to confirm it works before finishing.
5. Wrap all code output in proper code fences with the language tag (e.g. \`\`\`typescript).
[OUTPUT] Output your internal reasoning in <think>...</think> blocks, followed by your final code/solution.`,
    capabilities: ['coding', 'math', 'data-analysis', 'logic'],
    maxTokens: 4096,
    temperature: 0.1
  },
  deep_planner: {
    id: 'deep_planner',
    name: 'Deep Planner',
    systemPrompt: `[ROLE] You are a Master Strategist and Analyzer.
[RULES]
1. Break the user's request into a logical, multi-step checklist.
2. If previous agents gathered context (check the scratchpad), incorporate their findings.
3. Use tools if you need to verify something before planning.
4. Use memo_write to save your plan so other agents can access it.
[OUTPUT] You MUST write out your internal thought process in <think>...</think> blocks. After thinking, output a clear, actionable plan or logical conclusion.`,
    capabilities: ['reasoning', 'planning', 'chain-of-thought'],
    maxTokens: 4096,
    temperature: 0.3
  },
  deep_research: {
    id: 'deep_research',
    name: 'Deep Research',
    systemPrompt: `[ROLE] You are a world-class research analyst. Your job is comprehensive, citation-backed research.
[RULES]
1. PLAN first: devise 5-10 targeted search queries covering the topic from multiple angles.
2. Use multi_search to run all queries in parallel.
3. For the top 3-5 most relevant results, use scrape_url to read the full article.
4. Cross-reference findings across sources. Note contradictions.
5. Use memo_write to save intermediate findings with key="research_findings".
6. ALWAYS cite sources as [Source-N: URL] inline in your text.
[OUTPUT] A comprehensive, structured research report with:
  - Executive Summary
  - Key Findings (cited)
  - Analysis
  - ## Sources section listing all URLs
Do NOT skip the sources section.`,
    capabilities: ['research', 'synthesis', 'citations', 'multi-search'],
    maxTokens: 16384,
    temperature: 0.1
  },
  persona_polisher: {
    id: 'persona_polisher',
    name: 'Persona & Polisher',
    systemPrompt: `[ROLE] You are a Master Communicator & Final Synthesizer.
[RULES]
1. Synthesize all raw factual information provided by the other agents in the scratchpad.
2. Match the user's requested or implied tone (e.g., formal, casual, bullet points).
3. STRICTLY FORBIDDEN: Do not expose the internal "agent chatter" (e.g., "The web explorer found", "According to the planner"). Act as a single cohesive AI.
4. Remove all internal headers, section dividers, and meta-commentary EXCEPT for source citations.
5. PRESERVE all [Source-N: URL] citations from the research. Add a ## Sources section at the end if sources were cited.
6. If any code blocks are present in the output, ensure they have correct language tags.
[OUTPUT] Output only the final response that the user will read, with citations preserved.`,
    capabilities: ['formatting', 'tone', 'synthesis'],
    maxTokens: 8192,
    temperature: 0.4
  }
};

export class AgentOrchestrator {

  // Patterns that indicate casual/small-talk — these bypass multi-agent overhead
  private static CASUAL_PATTERNS = [
    /^(hi|hello|hey|sup|yo|hiya|howdy)[\s!?.]*$/i,
    /^(thanks?|thank you|thx|ty)[\s!?.]*$/i,
    /^(ok|okay|got it|sure|sounds good|cool|great|nice|awesome)[\s!?.]*$/i,
    /^(how are you|how's it going|what's up|whats up)[\s!?.]*$/i,
    /^(bye|goodbye|see you|cya)[\s!?.]*$/i,
    /^(yes|no|maybe|yep|nope|yeah|nah)[\s!?.]*$/i,
  ];

  async orchestrateSupervisor(
    messages: any[],
    context: any,
    onChunk: (chunk: any) => void
  ): Promise<string> {
    const promptMessage = (messages[messages.length - 1]?.content || '').trim();
    logger.info(`[Supervisor] Analyzing prompt: ${promptMessage.substring(0, 80)}...`);

    // ── Subagent context: use the user-selected model and provider for intermediate agents/subagents
    const subagentContext = { ...context };

    // ── Fast path: casual/small-talk bypasses all agents ──────────────────────
    const isCasual = AgentOrchestrator.CASUAL_PATTERNS.some(p => p.test(promptMessage));
    if (isCasual) {
      logger.info('[Supervisor] Fast-path: casual message, bypassing orchestrator');
      let reply = '';
      await new Promise<void>((resolve, reject) => {
        UnifiedEngine.executeStream(
          { provider: context.provider, model: context.model, messages, apiKey: context.apiKey, settings: { temperature: 0.7, maxTokens: 256, antigravity: false } },
          (chunk: any) => { 
            if (chunk.chunk) { 
              reply += chunk.chunk; 
              onChunk({ chunk: chunk.chunk }); 
            } else if (chunk.type === 'thinking') {
              onChunk(chunk);
            } else if (chunk.type === 'error' || chunk.error) {
              onChunk(chunk);
            }
          },
          () => resolve()
        ).catch(reject);
      });
      return reply;
    }

    onChunk({ type: 'thinking', content: `━━━ [Supervisor] Routing request... ━━━\n` });

    // ── M7: Inject long-term memory into swarm at start ───────────────────────
    let swarmMemory = '';
    try {
      const ltm = await searchMemory(promptMessage, 3);
      if (ltm && ltm.trim()) {
        swarmMemory = `[Long-Term Memory]\n${ltm}`;
        onChunk({ type: 'thinking', content: `\n📚 Retrieved relevant memories from long-term storage\n` });
        logger.info('[Supervisor] Injected long-term memory into swarm');
      }
    } catch (e: any) {
      logger.warn('[Supervisor] LTM retrieval failed (non-fatal):', e.message);
    }

    const supervisorPrompt = `
You are the Supervisor Agent (The CEO). Analyze the user's request and break it down into a sequence of dependent subtasks. 
Assign each subtask to the most appropriate agent.

Available Agents:
- deep_planner: reasoning, planning, strategy, multi-step analysis, writing, general knowledge
- deep_research: COMPREHENSIVE research requiring multiple sources, citations, reports (use when user asks for research, analysis, or detailed fact-finding)
- web_explorer: quick real-time info, news, current events, prices, weather — single topic lookup
- doc_cruncher: reading uploaded files, code analysis, document questions
- code_interpreter: coding tasks, debugging, math, running scripts, file operations
- persona_polisher: ALWAYS include LAST to format and polish the final output

Routing Rules:
1. For RESEARCH tasks (anything requiring multiple sources or deep investigation), use deep_research instead of web_explorer.
2. Break complex tasks down. If coding is needed, ALWAYS run a deep_planner first to plan the logic.
3. The ledger executes sequentially. Later agents will see the output of earlier agents.
4. ALWAYS end the ledger with the persona_polisher to synthesize the final result.

Respond ONLY with a JSON object in this exact format:
{
  "reasoning": "Briefly explain step-by-step why you chose this sequence.",
  "ledger": [
    { "agent": "agent_1", "task": "Specific instructions for agent_1 based on the goal" },
    { "agent": "agent_2", "task": "Specific instructions for agent_2..." },
    { "agent": "persona_polisher", "task": "Synthesize the final answer" }
  ]
}

User Request: "${promptMessage.replace(/"/g, "'")}"
    `;

    const supervisorMessages = [...messages.slice(0, -1), { role: 'user', content: supervisorPrompt }];

    let routingPlanRaw = '';
    await new Promise<void>((resolve, reject) => {
      // Use gemini-2.5-flash for routing decisions to save tokens and prevent Gemma 500 errors
      UnifiedEngine.executeStream(
        { provider: 'gemini', model: 'gemini-2.5-flash', messages: supervisorMessages, apiKey: context.apiKey, settings: { temperature: 0.0, maxTokens: 300 } },
        (chunk: any) => { routingPlanRaw += chunk.chunk || ''; },
        () => resolve()
      ).catch(reject);
    });


    let taskLedger: { agent: string; task: string }[] = [];
    try {
      const cleaned = routingPlanRaw.replace(/```(json)?[\s\S]*?```/g, (match) => {
        return match.replace(/```(json)?/, '').replace(/```/, '');
      }).trim();
      const startIndex = cleaned.indexOf('{');
      const endIndex = cleaned.lastIndexOf('}');
      if (startIndex !== -1 && endIndex !== -1) {
        const jsonStr = cleaned.slice(startIndex, endIndex + 1);
        const plan = JSON.parse(jsonStr);
        taskLedger = plan.ledger || [];
        onChunk({ type: 'thinking', content: `\n💡 [Supervisor Reasoning]: ${plan.reasoning}\n` });
      } else {
        throw new Error('No JSON object found');
      }
      taskLedger = taskLedger.filter((l: any) => AGENT_REGISTRY[l.agent]);
    } catch (e) {
      logger.warn('[Supervisor] Failed to parse routing plan, using fallback. Raw: ' + routingPlanRaw);
      const executionOrder = Object.keys(AGENT_REGISTRY).filter(id => routingPlanRaw.includes(id));
      if (executionOrder.length === 0) {
        taskLedger = [
          { agent: 'deep_planner', task: 'Analyze the request' },
          { agent: 'persona_polisher', task: 'Format final response' }
        ];
      } else {
        taskLedger = executionOrder.map(id => ({ agent: id, task: 'Proceed with task' }));
      }
    }

    // Always ensure persona_polisher is last
    if (taskLedger.some(l => l.agent === 'persona_polisher')) {
      taskLedger = [...taskLedger.filter(l => l.agent !== 'persona_polisher'), { agent: 'persona_polisher', task: 'Synthesize the final answer with all citations preserved' }];
    } else {
      taskLedger.push({ agent: 'persona_polisher', task: 'Synthesize the final answer with all citations preserved' });
    }

    const planStr = taskLedger.map(l => l.agent).join(' → ');
    logger.info(`[Supervisor] Execution Plan: ${planStr}`);
    onChunk({ type: 'thinking', content: `\n🗺️  Plan: ${planStr}\n` });

    const isGemma = context.model && context.model.toLowerCase().includes('gemma-4');

    // ── M6: Adaptive MAX_LOOPS based on complexity ─────────────────────────────
    const complexityScore = scoreComplexity(promptMessage);
    let SWARM_MAX_LOOPS = complexityScore >= 4 ? 300 :
                            complexityScore >= 3 ? 150 :
                            complexityScore >= 2 ? 75 :
                            40;
    
    if (isGemma) {
      SWARM_MAX_LOOPS = 3;
      onChunk({ type: 'thinking', content: `\n🛡️ [Gemma Protocol] Limiting max reasoning loops to ${SWARM_MAX_LOOPS} to prevent hallucinations.\n` });
    } else {
      onChunk({ type: 'thinking', content: `⚡ Complexity: ${complexityScore}/5 → Loop budget: ${SWARM_MAX_LOOPS}\n` });
    }

    const completedTasks: string[] = [];
    const swarmSessionId = `swarm_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Import redis dynamically to persist state without breaking if redis is offline
    import('../../redis.js').then(({ default: redis }) => {
      redis.set(`swarm_state:${swarmSessionId}`, JSON.stringify({ status: 'started', ledger: taskLedger })).catch(() => {});
    });

    // ── M6: Cross-agent parallel batch execution ───────────────────────────────
    while (taskLedger.length > 0) {
      // Collect all leading independent tasks that can run in parallel.
      // Independence rule: tasks are parallel if none of them is persona_polisher
      // and they don't read from memos written by another task in the same batch.
      const batch: typeof taskLedger = [];
      
      if (taskLedger[0].agent === 'persona_polisher') {
        // Run polisher immediately — it needs all previous output
        // persona_polisher uses the user's ORIGINAL model for the final visible response
        const step = taskLedger.shift()!;
        const agent = AGENT_REGISTRY[step.agent];
        onChunk({ type: 'thinking', content: `\n━━━ [Persona & Polisher] Crafting final response... ━━━\n` });
        const finalAnswer = await this.runAgent(agent, messages, context, onChunk, swarmMemory, step.task, SWARM_MAX_LOOPS);
        
        // ── M5: Extract artifacts from final answer ────────────────────────────
        const { text: cleanText, artifacts } = extractArtifacts(finalAnswer);
        for (const artifact of artifacts) {
          onChunk({ type: 'artifact', artifact });
          logger.info(`[Orchestrator] Emitting artifact: ${artifact.id} (${artifact.type})`);
        }

        import('../../redis.js').then(({ default: redis }) => {
          redis.set(`swarm_state:${swarmSessionId}`, JSON.stringify({ status: 'completed', memory: swarmMemory })).catch(() => {});
        });
        return artifacts.length > 0 ? cleanText : finalAnswer;
      }

      // Batch all consecutive non-polisher tasks
      while (taskLedger.length > 0 && taskLedger[0].agent !== 'persona_polisher') {
        batch.push(taskLedger.shift()!);
      }

      // Group by agent for logging
      const agentCounts = batch.reduce((acc, s) => {
        acc[s.agent] = (acc[s.agent] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const batchDesc = Object.entries(agentCounts).map(([a, n]) => `${n}x ${AGENT_REGISTRY[a]?.name || a}`).join(', ');
      onChunk({ type: 'thinking', content: `\n━━━ [Swarm Queue] Spawning parallel batch: [${batchDesc}] ━━━\n` });
      batch.forEach((step, i) => onChunk({ type: 'thinking', content: `┌─ Task ${i + 1} (${step.agent}): ${step.task}\n` }));

      // Run batch in parallel using Promise.allSettled
      // Non-polisher subagents use gemini-2.5-flash (subagentContext) to save tokens
      const promises = batch.map(step => {
        const agent = AGENT_REGISTRY[step.agent];
        if (!agent) return Promise.resolve(`[Skipped: unknown agent ${step.agent}]`);
        return this.runAgent(agent, messages, subagentContext, onChunk, swarmMemory, step.task, SWARM_MAX_LOOPS);
      });
      const results = await Promise.allSettled(promises);

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const step = batch[i];
        const agent = AGENT_REGISTRY[step.agent];
        let resultOutput = res.status === 'fulfilled' ? res.value : `Error: ${res.reason}`;

        // Kimi Parity: Dynamic Agent Spawning
        const spawnRegex = /\[SPAWN:\s*([^:]+):\s*([^\]]+)\]/g;
        let match;
        while ((match = spawnRegex.exec(resultOutput)) !== null) {
          const spawnAgentId = match[1].trim();
          const spawnTask = match[2].trim();
          if (AGENT_REGISTRY[spawnAgentId]) {
            onChunk({ type: 'thinking', content: `├─ ⚡ Dynamically spawning sub-agent: ${spawnAgentId} for: ${spawnTask}\n` });
            const polisherIdx = taskLedger.findIndex(l => l.agent === 'persona_polisher');
            if (polisherIdx !== -1) {
              taskLedger.splice(polisherIdx, 0, { agent: spawnAgentId, task: spawnTask });
            } else {
              taskLedger.unshift({ agent: spawnAgentId, task: spawnTask });
            }
          }
        }
        
        resultOutput = resultOutput.replace(spawnRegex, '').trim();
        swarmMemory += `\n\n--- Memory from ${agent?.name || step.agent} (Task: ${step.task}) ---\n${resultOutput}`;
        completedTasks.push(`[${agent?.name || step.agent}]: ${step.task}`);
      }

      onChunk({ type: 'thinking', content: `└─ Batch complete.\n` });

      // Periodically update state
      import('../../redis.js').then(({ default: redis }) => {
        redis.set(`swarm_state:${swarmSessionId}`, JSON.stringify({ status: 'running', ledger: taskLedger, memory: swarmMemory })).catch(() => {});
      });
    }

    // Fallback inline synthesis when no polisher was routed
    if (swarmMemory) {
      onChunk({ type: 'thinking', content: `\n━━━ [Synthesis] Formatting final response... ━━━\n` });
      const lastMsg = messages[messages.length - 1];
      const synthesisMessages = [
        { role: 'system', content: 'Synthesize the provided agent outputs into a single, clean, well-formatted response to the user. Remove all section dividers, agent headers, and meta-text. Preserve all [Source-N: URL] citations. Output only the final answer.' },
        ...messages.slice(0, -1),
        { role: 'user', content: `User Request: ${lastMsg.content}\n\nAgent Outputs:\n${swarmMemory}` }
      ];
      let synthesized = '';
      await new Promise<void>((resolve, reject) => {
        UnifiedEngine.executeStream(
          { provider: context.provider, model: context.model, messages: synthesisMessages, apiKey: context.apiKey, settings: { temperature: 0.2, maxTokens: 4096 } },
          (chunk: any) => { 
            if (chunk.chunk) { 
              synthesized += chunk.chunk; 
              onChunk({ chunk: chunk.chunk }); 
            } else if (chunk.type === 'thinking') {
              onChunk(chunk);
            } else if (chunk.type === 'error' || chunk.error) {
              onChunk(chunk);
            }
          },
          () => resolve()
        ).catch(reject);
      });
      return synthesized;
    }

    return swarmMemory;
  }

  private async runAgent(
    agent: AgentConfig,
    messages: any[],
    context: any,
    onChunk: (chunk: any) => void,
    swarmMemory?: string,
    assignedTask?: string,
    maxLoops: number = 150
  ): Promise<string> {
    const lastMsg = messages[messages.length - 1];
    
    const isGemma = context.model && context.model.toLowerCase().includes('gemma-4');
    
    let instructions = assignedTask ? `[CEO ASSIGNED TASK]\n${assignedTask}\n\n` : '';
    if (swarmMemory) {
      let memoryToInject = swarmMemory;
      // Gemma mitigation: aggressive context truncation to prevent hallucination loops
      if (isGemma && swarmMemory.length > 8000) {
        memoryToInject = "... [EARLIER MEMORY TRUNCATED FOR CONTEXT LIMITS] ...\n" + swarmMemory.slice(-8000);
      }
      instructions += `[INSTRUCTIONS] Read the Swarm Memory below. Build upon their findings. Do not repeat their work.\n\n[USER REQUEST]\n${lastMsg.content}\n\n[PREVIOUS SWARM MEMORY]\n${memoryToInject}\n\n`;
    } else {
      instructions += `[USER REQUEST]\n${lastMsg.content}\n\n`;
    }

    instructions += `[SWARM CAPABILITIES]\nIf you realize this task requires another agent to complete a sub-step, you can dynamically spawn them by outputting the exact string: \`[SPAWN: agent_id: specific task instructions]\` anywhere in your output. Available agents: deep_planner, deep_research, web_explorer, doc_cruncher, code_interpreter.\n\nUsing this context, please proceed with your specific task.`;

    const finalContent = instructions;

    const gemmaProtocol = isGemma ? `\n\n[GEMMA PROTOCOL]\n1. No Skipping: You must follow a strict step-by-step checklist.\n2. STOP AND WAIT: Before completing a subtask, stop and verify your reasoning.\n3. NEVER hallucinate tool outputs. If a tool fails, state the failure instead of fabricating a result.` : '';

    const agentMessages: any[] = [
      { role: 'system', content: agent.systemPrompt + gemmaProtocol },
      ...messages.slice(0, -1),
      { role: 'user', content: finalContent }
    ];

    let fullText = '';
    const tools = this.getToolsForAgent(agent.id, context);
    let isLooping = true;
    let loopCount = 0;

    // ── M1: Adaptive thinking budget ──────────────────────────────────────────
    const thinkingBudget = resolveThinkingBudget(lastMsg.content || '', agent.id);

    if (tools.length === 0) {
      await new Promise<void>((resolve, reject) => {
        UnifiedEngine.executeStream(
          {
            provider: context.provider,
            model: context.model,
            messages: agentMessages,
            apiKey: context.apiKey,
            settings: { temperature: agent.temperature, maxTokens: agent.maxTokens, thinkingBudget }
          },
          (chunk: any) => {
            const isThinking = chunk.thinking || chunk.type === 'thinking';
            if (isThinking) {
              const text = chunk.thinking || chunk.content || chunk.chunk;
              if (text) {
                fullText += text;
                onChunk({ type: 'thinking', content: text });
              }
            } else if (chunk.chunk) {
              fullText += chunk.chunk;
              if (agent.id === 'persona_polisher') {
                onChunk({ chunk: chunk.chunk });
              } else {
                onChunk({ type: 'thinking', content: chunk.chunk });
              }
            } else if (chunk.type === 'error' || chunk.error) {
              onChunk(chunk);
            }
          },
          () => resolve()
        ).catch(reject);
      });
      return fullText;
    }

    // ── M2: Interleaved Thinking + Tool Use (Claude-style) ────────────────────
    // The agent alternates between thinking blocks and tool calls within a single
    // turn, rather than making one monolithic pass. After each tool result, a brief
    // reflection step assesses the result before proceeding to the next action.
    while (isLooping && loopCount < maxLoops) {
      loopCount++;
      const pendingToolCalls: any[] = [];
      let stepText = '';

      if (loopCount === maxLoops - 1 && tools.length > 0) {
        agentMessages.push({
          role: 'system' as const,
          content: `[CRITICAL SYSTEM WARNING] You have reached your maximum reasoning budget (${maxLoops} iterations). You MUST finalize your response now and stop calling tools.`
        });
      }

      await new Promise<void>((resolve, reject) => {
        UnifiedEngine.executeStream(
          {
            provider: context.provider,
            model: context.model,
            messages: agentMessages,
            apiKey: context.apiKey,
            settings: { temperature: agent.temperature, maxTokens: agent.maxTokens, thinkingBudget },
            tools
          },
          (chunk: any) => {
            if (chunk.tool_call) {
              pendingToolCalls.push(chunk.tool_call);
              const argStr = JSON.stringify(chunk.tool_call.arguments || chunk.tool_call.args || {}).slice(0, 80);
              onChunk({ type: 'thinking', content: `\n⚡ [${agent.name}] → ${chunk.tool_call.name}(${argStr})\n` });
            } else {
              const isThinking = chunk.thinking || chunk.type === 'thinking';
              if (isThinking) {
                const text = chunk.thinking || chunk.content || chunk.chunk;
                if (text) {
                  stepText += text;
                  onChunk({ type: 'thinking', content: text });
                }
              } else if (chunk.chunk) {
                stepText += chunk.chunk;
                if (agent.id === 'persona_polisher') {
                  onChunk({ chunk: chunk.chunk });
                } else {
                  onChunk({ type: 'thinking', content: chunk.chunk });
                }
              } else if (chunk.type === 'error' || chunk.error) {
                onChunk(chunk);
              }
            }
          },
          () => resolve()
        ).catch(reject);
      });

      fullText += stepText;

      if (pendingToolCalls.length === 0) {
        isLooping = false;
        break;
      }

      for (const tc of pendingToolCalls) {
        // Append assistant tool call message
        agentMessages.push({
          role: 'assistant' as const,
          content: null,
          tool_calls: [{ id: tc.id || tc.name, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments || tc.args || {}) } }]
        });
        const result = await context.executeToolCallback(tc.name, tc.arguments || tc.args || {});
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        agentMessages.push({ role: 'tool' as const, tool_call_id: tc.id || tc.name, content: resultStr.slice(0, 8000) });
        onChunk({ type: 'thinking', content: `📋 Result: ${resultStr.slice(0, 200)}${resultStr.length > 200 ? '...' : ''}\n` });

        // ── M2 (Interleaved Thinking): After each tool result, inject a brief
        // reflection prompt so the model can assess the result before deciding
        // its next action — mirroring Claude's interleaved thinking behavior.
        if (pendingToolCalls.indexOf(tc) === pendingToolCalls.length - 1 && loopCount < maxLoops - 2) {
          agentMessages.push({
            role: 'user' as const,
            content: '[REFLECT] Briefly assess this tool result inside <think> tags. Does it fully answer your assigned task? What is your next action? If the task is complete, output your final answer directly.'
          });
        }
      }
    }

    return fullText;
  }

  private getToolsForAgent(agentId: string, context: any): any[] {
    const allTools: any[] = context?.tools || [];

    if (agentId === 'web_explorer') {
      return allTools.filter(t => ['web_search', 'searchWeb'].includes(t.function?.name));
    }
    if (agentId === 'deep_research') {
      return allTools.filter(t => ['web_search', 'multi_search', 'scrape_url', 'memo_write', 'memo_read'].includes(t.function?.name));
    }
    if (agentId === 'code_interpreter' || agentId === 'deep_planner') {
      return allTools; // Full access
    }
    if (agentId === 'doc_cruncher') {
      return allTools.filter(t => ['read_file', 'search_codebase', 'memo_read'].includes(t.function?.name));
    }
    return []; // persona_polisher needs no tools
  }
}
