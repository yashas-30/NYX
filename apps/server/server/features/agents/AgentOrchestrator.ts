import { UnifiedEngine } from '../../lib/aiEngine.js';
import logger from '../../lib/logger.js';
import { resolveThinkingBudget, scoreComplexity } from '../../lib/thinkingBudget.js';
import { searchMemory, embedText } from '../../lib/memory/vectorStore.js';
import { extractArtifacts } from '../../lib/artifacts.js';
import { EmbeddingService } from '../rag/embeddingService.js';
import { MemoryService } from '../memory/memoryService.js';
import { semanticCache } from '../../lib/semanticCache.js';
import { traceActiveSpan } from '../../lib/otel.js';
import { SharedContextPool } from './SharedContextPool.js';

const MAX_AGENT_ITERATIONS = 12;

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  onRetry?: (attempt: number, err: Error) => void
): Promise<T> {
  let lastError: Error = new Error('Max retry attempts exceeded');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRetryable =
        err?.message?.includes('429') ||
        err?.message?.includes('503') ||
        err?.message?.toLowerCase().includes('rate') ||
        err?.message?.toLowerCase().includes('overloaded') ||
        err?.message?.toLowerCase().includes('quota');
      if (attempt < maxAttempts && isRetryable) {
        const delayMs = 1000 * Math.pow(2, attempt - 1);
        onRetry?.(attempt, lastError);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        throw lastError;
      }
    }
  }
  throw lastError;
}

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
1. Use the 'search_web' tool to find real, current information. Do not guess facts or versions. ALWAYS search if the query involves time-sensitive data, news, or model releases.
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
1. Use read_file to read files.
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
  ui_designer: {
    id: 'ui_designer',
    name: 'UI/UX Visual Designer',
    systemPrompt: `[ROLE] You are an elite Frontend UI/UX Designer.
[RULES]
1. Focus on aesthetic layouts, typography, responsiveness, and premium styling tokens.
2. Use write_file to edit/create styles and markup, execute_command to run sandbox builds.
3. Align all components to design system principles (CSS variables, Framer Motion transitions).
[OUTPUT] Provide visual component code modifications and detail the UI styling improvements.`,
    capabilities: ['ui', 'ux', 'styling', 'css', 'layout', 'components'],
    maxTokens: 8192,
    temperature: 0.3
  },
  qa_reviewer: {
    id: 'qa_reviewer',
    name: 'QA & Correctness Reviewer',
    systemPrompt: `[ROLE] You are a meticulous QA & Code Reviewer.
[RULES]
1. Scan changes for logic flaws, syntax errors, and edge cases.
2. Use execute_command to run unit and integration tests.
3. Propose exact fixes for any errors or failed tests.
[OUTPUT] Detail review feedback, test executions, and recommended code fixes.`,
    capabilities: ['testing', 'qa', 'debugging', 'code-review', 'correctness'],
    maxTokens: 8192,
    temperature: 0.1
  },
  db_architect: {
    id: 'db_architect',
    name: 'Database Architect',
    systemPrompt: `[ROLE] You are a Senior Database Engineer.
[RULES]
1. Design efficient relational schemas and database indexes (SQLite, Drizzle ORM, Prisma).
2. Write schema files and database migration files.
[OUTPUT] Return migration commands, schema definitions, and query optimizations.`,
    capabilities: ['database', 'schema', 'migrations', 'sql', 'drizzle'],
    maxTokens: 4096,
    temperature: 0.1
  },
  security_auditor: {
    id: 'security_auditor',
    name: 'Security Auditor',
    systemPrompt: `[ROLE] You are a Security & Compliance Engineer.
[RULES]
1. Scan code for OWASP top vulnerabilities (SQLi, XSS, SSRF, RCE, path traversal).
2. Check for exposed secrets, api keys, or hardcoded credentials.
[OUTPUT] Report potential security findings and exact remediation guidelines.`,
    capabilities: ['security', 'auditing', 'compliance', 'secrets'],
    maxTokens: 4096,
    temperature: 0.1
  },
  performance_optimizer: {
    id: 'performance_optimizer',
    name: 'Performance Optimizer',
    systemPrompt: `[ROLE] You are a Performance Tuning Specialist.
[RULES]
1. Review code and queries for performance bottlenecks (memory leaks, slow loops, bundle sizes).
2. Optimize file reading, caching, and database query executions.
[OUTPUT] Highlight performance bottlenecks and provide optimized code snippets.`,
    capabilities: ['performance', 'optimization', 'profiling', 'caching'],
    maxTokens: 4096,
    temperature: 0.1
  },
  deployment_devops: {
    id: 'deployment_devops',
    name: 'DevOps & Deployment Engineer',
    systemPrompt: `[ROLE] You are a DevOps Specialist.
[RULES]
1. Audit and create Dockerfiles, Docker Compose files, Kubernetes manifests, and CI/CD pipelines.
2. Optimize build caching and verify environment setup.
[OUTPUT] Docker configurations, workflow files, or deploy instructions.`,
    capabilities: ['devops', 'deployment', 'docker', 'ci-cd', 'kubernetes'],
    maxTokens: 4096,
    temperature: 0.1
  },
  migration_expert: {
    id: 'migration_expert',
    name: 'Migration & Upgrades Expert',
    systemPrompt: `[ROLE] You are a Dependency & Upgrades Specialist.
[RULES]
1. Resolve package installation errors, version conflicts, and module deprecations.
2. Formulate step-by-step refactoring checklists to migrate legacy libraries.
[OUTPUT] Output updated package configs or framework migration logs.`,
    capabilities: ['migration', 'dependency', 'package-manager', 'refactoring'],
    maxTokens: 8192,
    temperature: 0.1
  },
  docs_generator: {
    id: 'docs_generator',
    name: 'Documentation Generator',
    systemPrompt: `[ROLE] You are a Technical Writer.
[RULES]
1. Document the codebase, generate README files, OpenAPI specifications, or Swagger files.
2. Create accurate JSDoc/TSDoc inline code annotations.
[OUTPUT] Output formatted markdown documentations or API specs.`,
    capabilities: ['documentation', 'technical-writing', 'readme', 'api-spec'],
    maxTokens: 4096,
    temperature: 0.2
  },
  git_collaborator: {
    id: 'git_collaborator',
    name: 'Git Collaborator',
    systemPrompt: `[ROLE] You are a Git Release Manager.
[RULES]
1. Analyze git diffs, generate pull request descriptions, commit messages, or branch guides.
2. Formulate resolutions for simple git merge conflicts.
[OUTPUT] Return clear PR logs, commit messages, or conflict reviews.`,
    capabilities: ['git', 'version-control', 'pull-request', 'commit-messages'],
    maxTokens: 4096,
    temperature: 0.2
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

  private static toolEmbeddingsCache = new Map<string, number[]>();

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
    return traceActiveSpan('AgentOrchestrator.orchestrateSupervisor', async (span) => {
    const promptMessage = (messages[messages.length - 1]?.content || '').trim();
    logger.info(`[Supervisor] Analyzing prompt: ${promptMessage.substring(0, 80)}...`);

    // ── Semantic cache check (avoid redundant LLM calls for similar prompts) ─────
    try {
      if (!semanticCache['embedder']) {
        await semanticCache.init(async (text: string) => embedText(text));
      }
      const cached = await semanticCache.get(promptMessage);
      if (cached) {
        logger.info('[Supervisor] SemanticCache HIT — returning cached response');
        onChunk({ type: 'thinking', content: `⚡ [Cache] Returning cached response (semantically equivalent prompt)\n` });
        onChunk({ chunk: cached });
        return cached;
      }
    } catch {
      // Cache is always best-effort — never block on failure
    }

    // ── Subagent context: use a lightweight model for parallel tool execution
    // M3: Parallel Subagent Routing - Use a fast local/cloud model for subagents
    let fastModel = context.model;
    if (context.provider === 'gemini') {
      fastModel = 'gemini-2.5-flash';
    } else if (context.provider === 'ollama' || context.provider === 'lmstudio') {
      fastModel = process.env.OLLAMA_FAST_MODEL || 'qwen2.5:1.5b'; // Default lightweight local model
    } else if (context.provider === 'anthropic') {
      fastModel = 'claude-3-5-haiku-20241022';
    } else if (context.provider === 'openai') {
      fastModel = 'gpt-4o-mini';
    }

    const subagentContext = {
      ...context,
      model: fastModel
    };

    // ── Fast path: casual/small-talk bypasses all agents ──────────────────────
    const isCasual = AgentOrchestrator.CASUAL_PATTERNS.some(p => p.test(promptMessage));
    if (isCasual) {
      logger.info('[Supervisor] Fast-path: casual message, bypassing orchestrator');
      let reply = '';
      await new Promise<void>((resolve, reject) => {
        UnifiedEngine.executeStream(
          { provider: context.provider, model: context.model, messages, apiKey: context.apiKey, settings: { temperature: 0.7, maxTokens: 256 } },
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

    let swarmMemory = '';
    let taskLedger: { id?: string; agent: string; task: string; depends_on?: string[] }[] = [];
    let fastPathMatched = false;

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
        fastPathMatched = true;
        break;
      }
    }

    if (!fastPathMatched) {
      // ── M7: Inject long-term memory into swarm at start ───────────────────────
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

      // Retrieve user personalization preferences
      let personalizationMemory = '';
      try {
        const pm = await MemoryService.retrieveMemories(promptMessage, 5);
        if (pm && pm.length > 0) {
          personalizationMemory = `[User Personalization Preferences]\n${pm.map(f => `- ${f}`).join('\n')}\n\n`;
          onChunk({ type: 'thinking', content: `👤 Applied user personalization profile\n` });
          logger.info('[Supervisor] Applied user personalization memories');
        }
      } catch (e: any) {
        logger.warn('[Supervisor] Personalization retrieval failed (non-fatal):', e.message);
      }

      const currentDateStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const supervisorPrompt = `
You are the Supervisor Agent (The CEO). Analyze the user's request and break it down into a sequence of dependent subtasks. 
Assign each subtask to the most appropriate agent.

[CURRENT TIME CONTEXT]
The current date and time is: ${currentDateStr}. Use this context for real-time awareness and accurate routing.

${personalizationMemory}
Available Agents:
- deep_planner: reasoning, planning, strategy, multi-step analysis, general logic
- deep_research: COMPREHENSIVE multi-query web research, citations, reports
- web_explorer: quick real-time single-query info, news, facts
- doc_cruncher: reading uploaded files, file structure analysis, codebase exploration
- code_interpreter: executing sandboxed code, shell commands, script execution, math
- ui_designer: UI/UX, CSS styling, components, HTML structure, responsive layouts
- qa_reviewer: code correctness, tests, bugs, syntax/type checks, debugging
- db_architect: database schema design, migrations, ORM (Drizzle/Prisma) configs
- security_auditor: checking for vulnerabilities (SQLi, XSS, SSRF, RCE), secrets exposure
- performance_optimizer: memory leaks, slow loops, database index, page speed diagnostics
- deployment_devops: CI/CD, Dockerfiles, Kubernetes, environment setup
- migration_expert: framework version upgrades, package conflicts, legacy refactoring
- docs_generator: README, API documentation, JSDoc/TSDoc, OpenAPI/Swagger specs
- git_collaborator: PR descriptions, commit messages, git branch conflicts
- persona_polisher: ALWAYS include LAST to format and polish final response

Routing Rules (DYNAMIC MINI-ROUTING):
1. MINIMIZE execution. You must only schedule the absolute minimum necessary subagents to resolve the request.
2. If the user request is focused on a single specialty (e.g. styling, database schema, bug review, fast search), ONLY schedule that single specialized agent + persona_polisher. Do NOT schedule deep_planner or code_interpreter unless multi-step programming/strategy is required.
3. Never route to agents that have nothing to do with the prompt properties.
4. Always end the ledger with the persona_polisher to synthesize the final result.

Respond ONLY with a JSON object in this exact format:
{
  "reasoning": "Briefly explain step-by-step why you chose this minimal sequence.",
  "ledger": [
    { "id": "task_1", "agent": "agent_id", "task": "Specific task instructions", "depends_on": [] }
  ]
}

User Request: "${promptMessage.replace(/"/g, "'")}"
      `;

      const supervisorMessages = [...messages.slice(0, -1), { role: 'user' as const, content: supervisorPrompt }];

      const ledgerSchema = {
        type: 'OBJECT',
        properties: {
          reasoning: { type: 'STRING' },
          ledger: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                id: { type: 'STRING' },
                agent: { type: 'STRING' },
                task: { type: 'STRING' },
                depends_on: { type: 'ARRAY', items: { type: 'STRING' } }
              },
              required: ['id', 'agent', 'task', 'depends_on']
            }
          }
        },
        required: ['reasoning', 'ledger']
      };

      let routingPlanRaw = '';
      await new Promise<void>((resolve, reject) => {
        // Use user's selected provider and model with JSON mode & schema for reliable structured output
        UnifiedEngine.executeStream(
          {
            provider: context.provider,
            model: context.model,
            messages: supervisorMessages,
            apiKey: context.apiKey,
            settings: {
              temperature: 0.0,
              maxTokens: 1000,
              
              jsonMode: true,
              jsonSchema: ledgerSchema
            }
          },
          (chunk: any) => { routingPlanRaw += chunk.chunk || ''; },
          () => resolve()
        ).catch(reject);
      });

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

    // Emit initial progress metadata for the frontend progress bar
    const totalSteps = taskLedger.length;
    const swarmStartTime = Date.now();
    let currentStep = 0;
    onChunk({
      type: 'agent_progress',
      step: 0,
      total: totalSteps,
      agents: taskLedger.map(l => l.agent),
      elapsed: 0,
    });

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
    }).catch(() => {});

    let totalExecutions = 0;
    const MAX_TOTAL_EXECUTIONS = 15; // Hard limit on total subagent runs to prevent runaway loops

    // ── M6: Cross-agent parallel batch execution ───────────────────────────────
    let completedTaskIds = new Set<string>();

    while (taskLedger.length > 0) {
      if (totalExecutions >= MAX_TOTAL_EXECUTIONS) {
        logger.warn(`[Orchestrator] Swarm execution limit reached (${MAX_TOTAL_EXECUTIONS} executions). Forcing termination.`);
        onChunk({ type: 'thinking', content: `\n⚠️ [Supervisor WARNING]: Swarm execution limit reached (${MAX_TOTAL_EXECUTIONS} executions). Forcing response synthesis to prevent runaway loop.\n` });
        const polisher = taskLedger.find(l => l.agent === 'persona_polisher');
        taskLedger = polisher ? [polisher] : [{ agent: 'persona_polisher', task: 'Synthesize the final answer with all citations preserved' }];
      }

      const batch: typeof taskLedger = [];
      
      // Determine what tasks are executable (dependencies met)
      const executableTasks = taskLedger.filter(t => 
        t.agent === 'persona_polisher' ? taskLedger.length === 1 : (t.depends_on || []).every(dep => completedTaskIds.has(dep))
      );

      if (executableTasks.length === 0) {
        // Fallback: circular dependency or missing deps, just take the first task
        logger.warn('[Supervisor] Dependency stall detected! Forcing execution of the first pending task.');
        executableTasks.push(taskLedger[0]);
      }

      const polisherStep = executableTasks.find(t => t.agent === 'persona_polisher');
      
      if (polisherStep) {
        // Run polisher immediately — it needs all previous output
        // persona_polisher uses the user's ORIGINAL model for the final visible response
        const step = polisherStep;
        taskLedger = taskLedger.filter(t => t !== step);
        totalExecutions++;
        const agent = AGENT_REGISTRY[step.agent];
        onChunk({ type: 'thinking', content: `\n━━━ [Persona & Polisher] Crafting final response... ━━━\n` });

        // Instantiate StreamingArtifactParser to extract artifacts token-by-token
        const { StreamingArtifactParser } = await import('../../lib/streamingArtifactParser.js');
        const parser = new StreamingArtifactParser();
        let cleanedResponse = '';

        const finalAnswer = await this.runAgent(
          agent,
          messages,
          context,
          (chunk: any) => {
            if (chunk.chunk) {
              const { textChunk, activeArtifact } = parser.ingest(chunk.chunk);
              if (textChunk) {
                cleanedResponse += textChunk;
                onChunk({ chunk: textChunk });
              }
              if (activeArtifact) {
                onChunk({ type: 'artifact', artifact: activeArtifact });
              }
            } else {
              onChunk(chunk);
            }
          },
          swarmMemory,
          step.task,
          SWARM_MAX_LOOPS
        );

        // Flush remaining buffer in the parser
        const { textChunk, activeArtifact } = parser.flush();
        if (textChunk) {
          cleanedResponse += textChunk;
          onChunk({ chunk: textChunk });
        }
        if (activeArtifact) {
          onChunk({ type: 'artifact', artifact: activeArtifact });
        }

        import('../../redis.js').then(({ default: redis }) => {
          redis.set(`swarm_state:${swarmSessionId}`, JSON.stringify({ status: 'completed', memory: swarmMemory })).catch(() => {});
        }).catch(() => {});
        return cleanedResponse || finalAnswer;
      }

      // Batch all non-polisher tasks that are executable
      batch.push(...executableTasks);
      taskLedger = taskLedger.filter(t => !batch.includes(t));
      
      totalExecutions += batch.length;

      // Group by agent for logging
      const agentCounts = batch.reduce((acc, s) => {
        acc[s.agent] = (acc[s.agent] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const batchDesc = Object.entries(agentCounts).map(([a, n]) => `${n}x ${AGENT_REGISTRY[a]?.name || a}`).join(', ');
      currentStep++;
      onChunk({
        type: 'agent_progress',
        step: currentStep,
        total: totalSteps,
        currentAgent: batch[0]?.agent,
        elapsed: Date.now() - swarmStartTime,
      });
      onChunk({ type: 'thinking', content: `\n━━━ [Swarm Queue] Spawning parallel batch: [${batchDesc}] ━━━\n` });
      batch.forEach((step, i) => onChunk({ type: 'thinking', content: `┌─ Task ${i + 1} (${step.agent}): ${step.task}\n` }));

      // Run batch in parallel to enable multi-agent swarm logic
      const results: PromiseSettledResult<any>[] = await Promise.allSettled(
        batch.map(async (step) => {
          const agent = AGENT_REGISTRY[step.agent];
          if (!agent) {
            return `[Skipped: unknown agent ${step.agent}]`;
          }
          return withRetry(
            () => this.runAgent(agent, messages, subagentContext, onChunk, swarmMemory, step.task, SWARM_MAX_LOOPS),
            3,
            (attempt, err) => {
              onChunk({ type: 'thinking', content: `\n⚠️ [${agent.name}] Retry ${attempt}/3 — ${err.message}\n` });
            }
          );
        })
      );

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const step = batch[i];
        const agent = AGENT_REGISTRY[step.agent];
        let resultOutput: string;
        if (res.status === 'fulfilled') {
          resultOutput = res.value;
        } else {
          const errMsg = res.reason instanceof Error ? res.reason.message : String(res.reason);
          const isBudgetError = errMsg.includes('429') || errMsg.toLowerCase().includes('rate') || errMsg.toLowerCase().includes('quota');
          resultOutput = isBudgetError
            ? `[AGENT_SKIPPED: ${agent?.name || step.agent} — Rate limited after 3 retries. Note in the final response that some information could not be retrieved.]`
            : `[AGENT_FAILED: ${agent?.name || step.agent} — ${errMsg}. Proceed without this agent's output and do not fabricate its findings.]`;
          onChunk({ type: 'thinking', content: `\n❌ [${agent?.name || step.agent}] Failed permanently: ${errMsg}\n` });
        }

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

        if (step.id) {
          completedTaskIds.add(step.id);
        }

        // Write to Shared Context Pool
        await SharedContextPool.writeContext(swarmSessionId, agent?.name || step.agent, step.task, resultOutput);
      }

      // Compress swarm memory asynchronously if it exceeds our context budget threshold
      swarmMemory = await this.compressMemory(swarmMemory, subagentContext);

      onChunk({ type: 'thinking', content: `└─ Batch complete.\n` });

      // Periodically update state
      import('../../redis.js').then(({ default: redis }) => {
        redis.set(`swarm_state:${swarmSessionId}`, JSON.stringify({ status: 'running', ledger: taskLedger, memory: swarmMemory })).catch(() => {});
      }).catch(() => {});
    }

    // Fallback inline synthesis when no polisher was routed
    if (swarmMemory) {
      onChunk({ type: 'thinking', content: `\n━━━ [Synthesis] Formatting final response... ━━━\n` });
      const lastMsg = messages[messages.length - 1];
      const synthesisMessages = [
        { role: 'system' as const, content: 'Synthesize the provided agent outputs into a single, clean, well-formatted response to the user. Remove all section dividers, agent headers, and meta-text. Preserve all [Source-N: URL] citations. Output only the final answer.' },
        ...messages.slice(0, -1),
        { role: 'user' as const, content: `User Request: ${lastMsg.content}\n\nAgent Outputs:\n${swarmMemory}` }
      ];
      let synthesized = '';
      await new Promise<void>((resolve, reject) => {
        UnifiedEngine.executeStream(
          { 
            provider: context.provider, 
            model: context.model, 
            messages: synthesisMessages, 
            apiKey: context.apiKey, 
            settings: { temperature: 0.2, maxTokens: 4096 } 
          },
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
    });
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
    return traceActiveSpan(`AgentOrchestrator.runAgent.${agent.id}`, async (span) => {
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

    instructions += `[SWARM CAPABILITIES]\nIf you realize this task requires another agent to complete a sub-step, you can dynamically spawn them by outputting the exact string: \`[SPAWN: agent_id: specific task instructions]\` anywhere in your output. Available agents: deep_planner, deep_research, web_explorer, doc_cruncher, code_interpreter, ui_designer, qa_reviewer, db_architect, security_auditor, performance_optimizer, deployment_devops, migration_expert, docs_generator, git_collaborator.\n\nUsing this context, please proceed with your specific task.`;

    const finalContent = instructions;

    const gemmaProtocol = isGemma ? `\n\n[GEMMA PROTOCOL]\n1. No Skipping: You must follow a strict step-by-step checklist.\n2. STOP AND WAIT: Before completing a subtask, stop and verify your reasoning.\n3. NEVER hallucinate tool outputs. If a tool fails, state the failure instead of fabricating a result.` : '';

    const currentDateStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const timeContext = `\n\n[CURRENT TIME CONTEXT]\nThe current date and time is: ${currentDateStr}. Use this for any real-time web searches or time-sensitive data analysis.`;

    const agentMessages: any[] = [
      { role: 'system', content: agent.systemPrompt + gemmaProtocol + timeContext },
      ...messages.slice(0, -1),
      { role: 'user', content: finalContent }
    ];

    let fullText = '';
    const tools = await this.selectToolsSemantically(agent.id, assignedTask || '', context);
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
      if (loopCount > MAX_AGENT_ITERATIONS) {
        throw new Error(`[AgentOrchestrator] Agent ${agent.name} exceeded maximum tool call iterations of ${MAX_AGENT_ITERATIONS}`);
      }
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
    });
  }

  private getToolsForAgent(agentId: string, context: any): any[] {
    const allTools: any[] = context?.tools || [];

    if (agentId === 'web_explorer') {
      return allTools.filter(t => ['search_web', 'searchWeb'].includes(t.function?.name));
    }
    if (agentId === 'deep_research') {
      return allTools.filter(t => ['search_web', 'multi_search', 'scrape_url', 'memo_write', 'memo_read'].includes(t.function?.name));
    }
    if (
      agentId === 'code_interpreter' ||
      agentId === 'deep_planner' ||
      agentId === 'ui_designer' ||
      agentId === 'qa_reviewer' ||
      agentId === 'db_architect' ||
      agentId === 'security_auditor' ||
      agentId === 'performance_optimizer' ||
      agentId === 'deployment_devops' ||
      agentId === 'migration_expert' ||
      agentId === 'git_collaborator'
    ) {
      return allTools; // Full access
    }
    if (agentId === 'doc_cruncher') {
      return allTools.filter(t => ['read_file', 'memo_read'].includes(t.function?.name));
    }
    return []; // persona_polisher needs no tools
  }

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
      // Use gemini for embeddings here as it's the primary provider
      const taskEmbedding = await EmbeddingService.embedText(assignedTask, { provider: 'gemini' });
      
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

      // Filter tools with similarity score > 0.35 (excluding already added base tools)
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

  private async compressMemory(memory: string, context: any): Promise<string> {
    return traceActiveSpan('AgentOrchestrator.compressMemory', async (span) => {
    if (memory.length < 4000) return memory;
    logger.info('[Supervisor] Swarm memory is too large, performing compression...');
    
    const compressionMessages = [
      {
        role: 'system' as const,
        content: 'You are an elite research summarizer. Condense the provided swarm memory into a highly structured, dense, bulleted list of key findings, decisions made, code files modified, and tool results. Keep all Source-N URLs exactly as cited. Keep all crucial code paths and values. Remove all fluff, descriptions, or redundant summaries. Output only the condensed memory.'
      },
      {
        role: 'user' as const,
        content: `Swarm Memory to condense:\n\n${memory}`
      }
    ];

    let compressed = '';
    try {
      await new Promise<void>((resolve, reject) => {
        UnifiedEngine.executeStream(
          {
            provider: context.provider,
            model: context.model,
            messages: compressionMessages,
            apiKey: context.apiKey,
            settings: { temperature: 0.1, maxTokens: 2048 }
          },
          (chunk: any) => { if (chunk.chunk) compressed += chunk.chunk; },
          () => resolve()
        ).catch(reject);
      });
      logger.info(`[Supervisor] Memory compressed from ${memory.length} to ${compressed.length} chars.`);
      return compressed;
    } catch (err: any) {
      logger.warn('[Supervisor] Memory compression failed (non-fatal):', err.message);
      return memory; // Fallback to raw memory on failure
    }
    });
  }
}
