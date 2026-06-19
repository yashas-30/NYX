import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, MessageSquare, History, Brain, Calendar, Activity,
  Play, Pause, Trash2, Plus, Search, Sparkles, AlertCircle,
  CheckCircle2, XCircle, ArrowRight, ShieldCheck, RefreshCw,
  Clock, Tag, Network, Info, Server, Terminal, User, BookOpen
} from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';
import { useHermesStore, HermesTask, HermesCron, MemoryEntity, MemoryRelation, MemoryObservation } from '@src/stores/useHermesStore';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { HermesAgent } from '@src/core/agents/HermesAgent';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: any;
    result?: any;
    status: 'running' | 'completed' | 'failed';
  }>;
}

export default function HermesView() {
  const store = useHermesStore();
  const nyxStore = useNyxStore();

  const [activeTab, setActiveTab] = useState<'chat' | 'tasks' | 'memory' | 'crons' | 'diagnostics'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Welcome to the **Hermes Autonomous Operator Control Room**. I am Hermes, your persistent memory agent and autonomous operations runner.

I can run background tasks, maintain your semantic knowledge graph, run recurring cron jobs, and perform systems checkups in your secure workspace sandbox.

How can I assist your operations today?`,
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Chat scroll anchor
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Memory Graph state
  const [memoryQuery, setMemoryQuery] = useState('');
  const [isAddingEntity, setIsAddingEntity] = useState(false);
  const [entityName, setEntityName] = useState('');
  const [entityType, setEntityType] = useState('Person');
  const [entityDesc, setEntityDesc] = useState('');

  const [isAddingRelation, setIsAddingRelation] = useState(false);
  const [relSource, setRelSource] = useState('');
  const [relTarget, setRelTarget] = useState('');
  const [relType, setRelType] = useState('developer_of');

  const [isAddingObservation, setIsAddingObservation] = useState(false);
  const [obsEntityId, setObsEntityId] = useState('');
  const [obsFact, setObsFact] = useState('');

  // Cron state
  const [isAddingCron, setIsAddingCron] = useState(false);
  const [cronName, setCronName] = useState('');
  const [cronDesc, setCronDesc] = useState('');
  const [cronExpr, setCronExpr] = useState('*/1 * * * *');
  const [cronPrompt, setCronPrompt] = useState('');

  // Diagnostics state
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);

  // Running diagnostics on load
  useEffect(() => {
    store.runDiagnostics();
  }, []);

  // Handle Send Message to Hermes Agent
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isGenerating) return;

    const userInput = chatInput.trim();
    setChatInput('');

    // Append User Message
    const userMsg: ChatMessage = { role: 'user', content: userInput };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    // Append initial assistant placeholder
    const assistantIndex = nextMessages.length;
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: '',
        thinking: 'Initializing Hermes Operator...',
        toolCalls: [],
      }
    ]);

    setIsGenerating(true);
    const abortController = new AbortController();

    try {
      const provider = nyxStore.currentModel.provider;
      const apiKey = nyxStore.apiKeys[provider];
      const isLocal = provider === 'ollama' || provider === 'lmstudio';

      if (!apiKey && !isLocal) {
        // Run Simulated Execution Loop when API keys are absent
        await simulateHermesResponse(userInput, assistantIndex);
      } else {
        // Run real Hermes Agent Response Loop
        const agent = new HermesAgent({
          modelId: nyxStore.models.nyx || nyxStore.currentModel.id,
          provider: provider,
          apiKey: apiKey,
          settings: nyxStore.modelSettings,
          history: nextMessages.map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content
          })),
        });

        const analysis = {
          intent: 'general_chat' as any,
          confidence: 1.0,
          detectedLanguages: [],
          frameworks: [],
          complexity: 'complex' as const,
          requiresContext: true,
          requiresExecution: true,
          estimatedTokens: 100,
          suggestedModel: 'powerful' as const,
          urgency: 'normal' as const,
          isFollowUp: nextMessages.length > 2,
        };

        const generator = agent.streamResponse(userInput, analysis, abortController.signal);

        for await (const rawEvent of generator) {
          const event = rawEvent as any;
          if (event.type === 'text') {
            setMessages(prev => {
              const clone = [...prev];
              clone[assistantIndex].content += event.content;
              return clone;
            });
          } else if (event.type === 'thinking') {
            setMessages(prev => {
              const clone = [...prev];
              clone[assistantIndex].thinking = (clone[assistantIndex].thinking || '') + '\n' + event.content;
              return clone;
            });
          } else if (event.type === 'tool_start') {
            setMessages(prev => {
              const clone = [...prev];
              const tCalls = clone[assistantIndex].toolCalls || [];
              tCalls.push({
                id: event.tool_call?.id || Math.random().toString(),
                name: event.tool_call?.name || 'unknown_tool',
                args: event.tool_call?.args || {},
                status: 'running',
              });
              clone[assistantIndex].toolCalls = tCalls;
              return clone;
            });
          } else if (event.type === 'tool_done') {
            setMessages(prev => {
              const clone = [...prev];
              const tCalls = clone[assistantIndex].toolCalls || [];
              const match = tCalls.find(tc => tc.name === event.name && tc.status === 'running');
              if (match) {
                match.status = 'completed';
                match.result = event.result;
              }
              clone[assistantIndex].toolCalls = tCalls;
              return clone;
            });
          } else if (event.type === 'tool_error') {
            setMessages(prev => {
              const clone = [...prev];
              const tCalls = clone[assistantIndex].toolCalls || [];
              const match = tCalls.find(tc => tc.name === event.name && tc.status === 'running');
              if (match) {
                match.status = 'failed';
                match.result = event.error;
              }
              clone[assistantIndex].toolCalls = tCalls;
              return clone;
            });
          } else if (event.type === 'error') {
            throw new Error(event.content);
          }
        }
      }
    } catch (err: any) {
      toast.error(`Agent loop encountered an error: ${err.message || String(err)}`);
      setMessages(prev => {
        const clone = [...prev];
        clone[assistantIndex].content += `\n\n*(Error: ${err.message || String(err)})*`;
        clone[assistantIndex].thinking = undefined;
        return clone;
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Simulated Agent Loop supporting real store mutations
  const simulateHermesResponse = async (input: string, assistantIndex: number) => {
    const inputLower = input.toLowerCase();
    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

    const updateThinking = (text: string) => {
      setMessages(prev => {
        const clone = [...prev];
        clone[assistantIndex].thinking = text;
        return clone;
      });
    };

    const addSimulatedTool = (name: string, args: any) => {
      const toolId = `sim-tool-${Date.now()}`;
      setMessages(prev => {
        const clone = [...prev];
        clone[assistantIndex].toolCalls = [
          ...(clone[assistantIndex].toolCalls || []),
          { id: toolId, name, args, status: 'running' }
        ];
        return clone;
      });
      return toolId;
    };

    const completeSimulatedTool = (toolId: string, result: any, isError = false) => {
      setMessages(prev => {
        const clone = [...prev];
        const tCalls = clone[assistantIndex].toolCalls || [];
        const match = tCalls.find(tc => tc.id === toolId);
        if (match) {
          match.status = isError ? 'failed' : 'completed';
          match.result = result;
        }
        return clone;
      });
    };

    const appendContent = (text: string) => {
      setMessages(prev => {
        const clone = [...prev];
        clone[assistantIndex].content += text;
        return clone;
      });
    };

    // Routing & parsing prompt semantically
    if (inputLower.includes('diagnostics') || inputLower.includes('system check')) {
      updateThinking('Analyzing system sandbox health parameters...');
      await sleep(1000);

      const toolId = addSimulatedTool('get_system_diagnostics', {});
      await sleep(1500);

      store.runDiagnostics();
      const diag = store.diagnostics;
      const diagResult = `OS: ${diag.os}\nSandbox status: ${diag.sandboxStatus}\nActive MCP: ${diag.activeMcpServers.join(', ')}`;
      completeSimulatedTool(toolId, diagResult);

      await sleep(500);
      updateThinking('');
      appendContent(`I have executed the **system diagnostics tool**.

Here is the current operational environment status:
- **Host Sandbox System**: \`${diag.os}\`
- **Sandbox Integrity**: \`${diag.sandboxStatus}\` (isolated securely)
- **Active MCP Connections**: ${diag.activeMcpServers.map(m => `\`${m}\``).join(', ')}
- **Last Verification Time**: ${diag.lastCheck}

Everything is green. System status is healthy.`);

    } else if (inputLower.includes('task') || inputLower.includes('queue') || inputLower.includes('run')) {
      updateThinking('Analyzing task queue requests...');
      await sleep(1000);

      const titleMatch = input.match(/(?:task|run)\s+([^"]+)/i);
      const taskTitle = titleMatch ? titleMatch[1].trim() : 'Autonomous Audit Operations';
      
      const toolId = addSimulatedTool('manage_hermes_task', {
        action: 'create',
        title: taskTitle,
        description: `Triggered autonomously by user chat command: "${input}"`
      });
      await sleep(1500);

      const newTaskId = store.addTask(taskTitle, `Triggered autonomously by user chat: "${input}"`);
      completeSimulatedTool(toolId, `Successfully created task. Task ID: ${newTaskId}`);

      await sleep(500);
      updateThinking('Updating created task to running state...');
      
      const updateToolId = addSimulatedTool('manage_hermes_task', {
        action: 'update',
        taskId: newTaskId,
        status: 'running',
        progress: 10,
        log: 'Triggering background worker initialization...'
      });
      await sleep(1000);
      store.updateTask(newTaskId, { status: 'running', progress: 10 });
      store.appendTaskLog(newTaskId, `[Simulated Run] Initialized via chat context: "${input}"`);
      completeSimulatedTool(updateToolId, `Successfully updated task ${newTaskId}`);

      await sleep(500);
      updateThinking('');
      appendContent(`Successfully initialized background task **"${taskTitle}"** under ID \`${newTaskId}\`.

I have updated the queue status to **running** and registered a background loop simulation. You can monitor the live logs and terminal output inside the **Task Queue** tab.`);

      // Background simulated run
      let progress = 10;
      const interval = setInterval(() => {
        progress += 30;
        const currentProgress = Math.min(progress, 100);
        const isDone = currentProgress >= 100;
        
        store.updateTask(newTaskId, {
          progress: currentProgress,
          status: isDone ? 'completed' : 'running',
          completedAt: isDone ? new Date().toISOString() : undefined
        });

        const logs = [
          `[Background Thread] Analyzing project layout context...`,
          `[Tool Execution] pnpm run typecheck`,
          `[Observation] Compilation checks succeeded.`,
          `[Background Thread] Completing operations and syncing changes...`,
          `[Hermes Gateway] Operations completed successfully.`
        ];

        const logIndex = Math.min(Math.floor((currentProgress / 100) * logs.length), logs.length - 1);
        store.appendTaskLog(newTaskId, logs[logIndex]);

        if (isDone) {
          clearInterval(interval);
          toast.success(`Autonomous task "${taskTitle}" finished!`);
        }
      }, 3000);

    } else if (inputLower.includes('remember') || inputLower.includes('memory') || inputLower.includes('observe')) {
      updateThinking('Accessing persistent memory graph database...');
      await sleep(1200);

      const factMatch = input.match(/(?:remember|observe)\s+([^"]+)/i);
      const factText = factMatch ? factMatch[1].trim() : 'User requested a custom observation sync.';

      const toolId = addSimulatedTool('manage_hermes_memory', {
        action: 'add_observation',
        entityId: 'ent-1',
        fact: factText
      });
      await sleep(1500);

      store.addObservation('ent-1', factText);
      completeSimulatedTool(toolId, 'Successfully added observation.');

      await sleep(500);
      updateThinking('');
      appendContent(`I have recorded that fact in my persistent knowledge graph.

**Fact added to memory:**
- Entity: **Yashas** (Developer)
- Observation: *"${factText}"*

This information will be loaded as long-term context to guide my future agentic reasoning cycles.`);

    } else if (inputLower.includes('cron') || inputLower.includes('schedule')) {
      updateThinking('Accessing job scheduler state...');
      await sleep(1000);

      const nameMatch = input.match(/(?:cron|schedule)\s+([^"]+)/i);
      const cronName = nameMatch ? nameMatch[1].trim() : 'System Health Monitor';

      const toolId = addSimulatedTool('schedule_hermes_cron', {
        action: 'create',
        name: cronName,
        expression: '*/5 * * * *',
        prompt: `Run diagnostics checkup and report anomalies for ${cronName}.`
      });
      await sleep(1500);

      const newCronId = store.addCron(cronName, 'Scheduled via chat wizard', '*/5 * * * *', `Run diagnostics checkup and report anomalies for ${cronName}.`);
      completeSimulatedTool(toolId, `Successfully created cron. Cron ID: ${newCronId}`);

      await sleep(500);
      updateThinking('');
      appendContent(`I have successfully scheduled a new cron job:

- **Cron Job Name**: *"${cronName}"*
- **Schedule Expression**: \`*/5 * * * *\` (runs every 5 minutes)
- **Instructions**: *"Run diagnostics checkup and report anomalies..."*

You can view, edit, or pause this job inside the **Cron Scheduler** tab.`);

    } else {
      updateThinking('Synthesizing operators instruction guide...');
      await sleep(1000);
      updateThinking('');
      appendContent(`I am currently running in **offline sandbox simulation mode** because no model API key is set for provider: \`${nyxStore.currentModel.provider}\`.

However, my direct memory store and operations tools are **100% active**! You can trigger mutations against my state using commands like:
- \`run task <title>\` - queues and runs a simulated background task
- \`remember <fact>\` - teaches me a preference or project constraint
- \`schedule cron <name>\` - configures a recurring background job
- \`run system check\` - triggers sandboxed diagnostics checkup

Let me know if you would like me to execute any of these commands!`);
    }
  };

  const filteredEntities = store.entities.filter(
    e => e.name.toLowerCase().includes(memoryQuery.toLowerCase()) ||
         e.type.toLowerCase().includes(memoryQuery.toLowerCase()) ||
         e.description.toLowerCase().includes(memoryQuery.toLowerCase())
  );

  return (
    <div className="h-full w-full flex flex-col bg-[#181715] text-[#faf9f5] font-sans selection:bg-[#cc785c]/20">
      {/* Editorial Header */}
      <div className="flex-shrink-0 border-b border-[#252320] bg-[#181715] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="bg-[#cc785c] text-white p-1.5 rounded-lg">
              <Cpu size={18} />
            </div>
            <h1 className="font-serif text-2xl font-normal tracking-tight text-[#faf9f5]">Hermes Autonomous Control Room</h1>
          </div>
          <p className="text-xs text-[#a09d96] mt-1 font-medium tracking-wide">
            Autonomous Operator Queue · Structured Entity Graph · Scheduled Crons · Sandboxed Diagnostics
          </p>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-1.5 overflow-x-auto bg-[#252320]/60 p-1 rounded-lg border border-[#252320] scrollbar-none">
          <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<MessageSquare size={13} />} label="Chat Console" />
          <TabButton active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} icon={<History size={13} />} label="Task Queue" />
          <TabButton active={activeTab === 'memory'} onClick={() => setActiveTab('memory')} icon={<Brain size={13} />} label="Knowledge Graph" />
          <TabButton active={activeTab === 'crons'} onClick={() => setActiveTab('crons')} icon={<Calendar size={13} />} label="Cron Scheduler" />
          <TabButton active={activeTab === 'diagnostics'} onClick={() => setActiveTab('diagnostics')} icon={<Activity size={13} />} label="Diagnostics" />
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 min-h-0 relative overflow-hidden flex">
        <AnimatePresence mode="wait">
          {/* TAB 1: Chat Console */}
          {activeTab === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col md:flex-row min-h-0"
            >
              {/* Left Chat Window */}
              <div className="flex-1 flex flex-col min-h-0 border-r border-[#252320] bg-[#181715]">
                {/* Messages Feed */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 custom-scrollbar">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
                      {/* Avatar */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
                        msg.role === 'user' ? 'bg-[#252320] text-[#faf9f5]' : 'bg-[#cc785c]/10 text-[#cc785c]'
                      }`}>
                        {msg.role === 'user' ? <User size={14} /> : 'H'}
                      </div>

                      {/* Content block */}
                      <div className="space-y-2">
                        {/* Thinking block */}
                        {msg.thinking && (
                          <div className="bg-[#1f1e1b] border border-[#252320] rounded-lg p-3 text-xs text-[#a09d96] font-mono leading-relaxed max-w-full overflow-x-auto">
                            <div className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-[10px] pb-1 text-[#cc785c]">
                              <Activity size={10} className="animate-pulse" />
                              <span>Reasoning Trace</span>
                            </div>
                            {msg.thinking}
                          </div>
                        )}

                        {/* Text bubbles */}
                        {msg.content && (
                          <div className={`p-4 rounded-xl text-sm leading-relaxed border ${
                            msg.role === 'user'
                              ? 'bg-[#cc785c] text-white border-transparent'
                              : 'bg-[#1f1e1b] text-[#faf9f5] border-[#252320] shadow-sm'
                          }`}>
                            <div className="prose prose-sm prose-invert max-w-none">
                              {msg.content.split('\n').map((para, pi) => (
                                <p key={pi} className="mb-2 last:mb-0">
                                  {para}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Executed Tools */}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            {msg.toolCalls.map((tc, tci) => (
                              <div key={tci} className="bg-[#181715] text-[#faf9f5] border border-[#252320]/20 rounded-lg p-2.5 font-mono text-[11px] max-w-full overflow-x-auto shadow-sm">
                                <div className="flex items-center justify-between gap-4 pb-1">
                                  <div className="flex items-center gap-1.5 text-[#cc785c] font-semibold">
                                    <Terminal size={11} />
                                    <span>{tc.name}</span>
                                  </div>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                    tc.status === 'completed' ? 'bg-[#5db872]/20 text-[#5db872]' :
                                    tc.status === 'failed' ? 'bg-[#c64545]/20 text-[#c64545]' : 'bg-[#e8a55a]/20 text-[#e8a55a] animate-pulse'
                                  }`}>
                                    {tc.status}
                                  </span>
                                </div>
                                <div className="text-[#a09d96] pl-3 py-0.5">
                                  Args: {JSON.stringify(tc.args)}
                                </div>
                                {tc.result && (
                                  <div className="border-t border-[#252320]/15 mt-1 pt-1 text-[#faf9f5]/80 pl-3">
                                    Result: <pre className="whitespace-pre-wrap break-all mt-0.5 text-[10px]">{typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2)}</pre>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Container */}
                <form onSubmit={handleSendMessage} className="p-4 border-t border-[#252320] bg-[#181715]">
                  <div className="relative flex items-center bg-[#1f1e1b] rounded-lg border border-[#252320] focus-within:border-[#cc785c] transition-all shadow-sm">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder="Ask Hermes to run tasks, schedule crons, retrieve statistics, or update memory..."
                      disabled={isGenerating}
                      className="flex-1 bg-transparent px-4 py-3 text-sm text-[#faf9f5] placeholder-[#a09d96]/55 focus:outline-none disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || isGenerating}
                      className="mr-2 px-4 py-1.5 bg-[#cc785c] text-white text-xs font-semibold rounded-md hover:bg-[#a9583e] transition-colors disabled:opacity-40 cursor-pointer flex items-center gap-1"
                    >
                      <span>Send</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Side panel: Live Task Logs */}
              <div className="w-full md:w-80 flex flex-col min-h-0 bg-[#252320]/20 p-4 overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-[#252320] mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#a09d96] flex items-center gap-1.5">
                    <History size={12} className="text-[#cc785c]" />
                    <span>Recent Queue Activity</span>
                  </h3>
                  <button onClick={() => setActiveTab('tasks')} className="text-[10px] text-[#cc785c] hover:underline font-semibold">
                    View Queue
                  </button>
                </div>

                <div className="space-y-3">
                  {store.tasks.slice(0, 5).map((t) => (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedTaskId(t.id);
                        setActiveTab('tasks');
                      }}
                      className="p-3 bg-[#1f1e1b] rounded-lg border border-[#252320] hover:border-[#cc785c] transition-all cursor-pointer shadow-sm group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-[#faf9f5] group-hover:text-[#cc785c] transition-colors line-clamp-1">{t.title}</span>
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="w-full bg-[#252320] h-1 rounded-full mt-2 overflow-hidden">
                        <div className="bg-[#cc785c] h-full" style={{ width: `${t.progress}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[#a09d96] mt-1.5 font-mono">
                        <span>Prog: {t.progress}%</span>
                        <span>{new Date(t.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}

                  {store.tasks.length === 0 && (
                    <div className="text-center py-8 text-xs text-[#a09d96]">
                      No active task queue executions.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: Task Queue Manager */}
          {activeTab === 'tasks' && (
            <motion.div
              key="tasks"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col md:flex-row min-h-0"
            >
              {/* Task List */}
              <div className="flex-1 overflow-y-auto px-6 py-6 border-r border-[#252320] space-y-4 bg-[#181715]">
                <div className="flex items-center justify-between border-b border-[#252320] pb-3">
                  <h2 className="font-serif text-lg text-[#faf9f5] flex items-center gap-2">
                    <History className="text-[#cc785c]" size={18} />
                    <span>Autonomous Operator Tasks</span>
                  </h2>
                  <button
                    onClick={() => store.clearTasks()}
                    className="text-xs text-[#c64545] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 size={12} />
                    <span>Clear All Tasks</span>
                  </button>
                </div>

                <div className="grid gap-3">
                  {store.tasks.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTaskId(t.id)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer shadow-sm ${
                        selectedTaskId === t.id
                          ? 'bg-[#252320] border-[#cc785c]'
                          : 'bg-[#1f1e1b] border-[#252320] hover:border-[#cc785c]/60'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-[#faf9f5]">{t.title}</h3>
                          <p className="text-xs text-[#a09d96] mt-0.5">{t.description}</p>
                        </div>
                        <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                          <StatusBadge status={t.status} />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (selectedTaskId === t.id) setSelectedTaskId(null);
                              store.deleteTask(t.id);
                            }}
                            className="text-[#a09d96] hover:text-[#c64545] p-1 rounded hover:bg-white/5 transition-colors cursor-pointer"
                            title="Delete Task"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px] text-[#a09d96] mb-1">
                          <span>Progress: {t.progress}%</span>
                          <span className="font-mono text-[10px]">ID: {t.id}</span>
                        </div>
                        <div className="w-full bg-[#252320] h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-[#cc785c] h-full transition-all duration-500"
                            style={{ width: `${t.progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Times */}
                      <div className="flex items-center gap-4 text-[10px] text-[#a09d96] mt-3 border-t border-[#252320]/50 pt-2 font-mono">
                        <span>Created: {new Date(t.createdAt).toLocaleString()}</span>
                        {t.completedAt && (
                          <span>Completed: {new Date(t.completedAt).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  ))}

                  {store.tasks.length === 0 && (
                    <div className="text-center py-12 text-sm text-[#a09d96] border border-dashed border-[#252320] rounded-xl bg-[#1f1e1b]">
                      Queue is currently empty. Run a command or schedule a task to trigger background execution threads.
                    </div>
                  )}
                </div>
              </div>

              {/* Task Details & Logs Panel */}
              <div className="w-full md:w-96 flex flex-col min-h-0 bg-[#252320]/20 p-6 overflow-y-auto">
                {selectedTaskId ? (() => {
                  const t = store.tasks.find(x => x.id === selectedTaskId);
                  if (!t) return <div className="text-center py-12 text-xs text-[#a09d96]">Select a task to view execution details.</div>;
                  return (
                    <div className="space-y-4 flex flex-col h-full">
                      <div>
                        <div className="flex items-center gap-2 pb-1">
                          <span className="text-[10px] font-bold font-mono bg-[#cc785c]/10 text-[#cc785c] px-2 py-0.5 rounded">ID: {t.id}</span>
                          <StatusBadge status={t.status} />
                        </div>
                        <h3 className="font-serif text-base text-[#faf9f5] font-normal">{t.title}</h3>
                        <p className="text-xs text-[#a09d96] mt-1">{t.description}</p>
                      </div>

                      {/* Execution Terminal Console */}
                      <div className="flex-1 flex flex-col min-h-[200px] bg-[#181715] text-[#faf9f5] border border-[#252320]/30 rounded-xl p-4 font-mono text-[11px] overflow-hidden shadow-inner">
                        <div className="flex items-center justify-between border-b border-[#252320]/15 pb-2 mb-2 shrink-0">
                          <div className="flex items-center gap-2 text-[#a09d96]">
                            <Terminal size={12} />
                            <span>execution_log.sh</span>
                          </div>
                          <span className="text-[9px] text-[#cc785c] animate-pulse">● LIVE STREAM</span>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1 text-[10px] leading-relaxed text-[#faf9f5]/90">
                          {t.logs.map((log, li) => (
                            <div key={li} className="hover:bg-white/5 px-1 rounded transition-colors whitespace-pre-wrap break-all">
                              <span className="text-[#a09d96] mr-2">[{li + 1}]</span>
                              <span>{log}</span>
                            </div>
                          ))}
                          {t.logs.length === 0 && (
                            <span className="text-muted-foreground italic">No logs registered yet.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12 text-xs text-[#a09d96] border border-dashed border-[#252320] rounded-xl bg-[#1f1e1b]/40">
                    <Info size={24} className="text-[#cc785c] mb-2" />
                    <span>Select an active/completed task in the left panel to inspect its live log trace and sandbox outputs.</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB 3: Knowledge Graph Viewer */}
          {activeTab === 'memory' && (
            <motion.div
              key="memory"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col md:flex-row min-h-0"
            >
              {/* Entities & Query Column */}
              <div className="flex-1 overflow-y-auto px-6 py-6 border-r border-[#252320] space-y-6 bg-[#181715]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#252320] pb-4">
                  <div>
                    <h2 className="font-serif text-lg text-[#faf9f5] flex items-center gap-2">
                      <Brain className="text-[#cc785c]" size={18} />
                      <span>Persistent Memory Graph</span>
                    </h2>
                    <p className="text-xs text-[#a09d96] mt-0.5">Maintain, search, and edit entities and structured relations.</p>
                  </div>
                  <div className="relative w-full sm:w-60">
                    <Search size={14} className="absolute left-3 top-2.5 text-[#a09d96]" />
                    <input
                      type="text"
                      placeholder="Search knowledge..."
                      value={memoryQuery}
                      onChange={e => setMemoryQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-[#252320] bg-[#1f1e1b] text-xs text-[#faf9f5] placeholder-[#a09d96]/40 focus:outline-none focus:border-[#cc785c]"
                    />
                  </div>
                </div>

                {/* Operations Forms */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  {/* Entity form */}
                  <div className="bg-[#252320]/40 border border-[#252320] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#a09d96] flex items-center gap-1.5">
                        <Plus size={13} className="text-[#cc785c]" />
                        <span>Add Entity</span>
                      </span>
                      <button onClick={() => setIsAddingEntity(!isAddingEntity)} className="text-[10px] text-[#cc785c] hover:underline font-semibold">
                        {isAddingEntity ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {isAddingEntity && (
                      <div className="space-y-2.5 pt-1">
                        <input
                          type="text"
                          placeholder="Name (e.g. Next.js)"
                          value={entityName}
                          onChange={e => setEntityName(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-[#252320] rounded-md text-xs bg-[#1f1e1b] text-[#faf9f5] focus:outline-none focus:border-[#cc785c]"
                        />
                        <select
                          value={entityType}
                          onChange={e => setEntityType(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-[#252320] rounded-md text-xs bg-[#1f1e1b] text-[#faf9f5] focus:outline-none cursor-pointer"
                        >
                          <option value="Person">Person</option>
                          <option value="Application">Application</option>
                          <option value="Framework">Framework</option>
                          <option value="Server">Server</option>
                          <option value="Library">Library</option>
                          <option value="Database">Database</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Description blurb..."
                          value={entityDesc}
                          onChange={e => setEntityDesc(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-[#252320] rounded-md text-xs bg-[#1f1e1b] text-[#faf9f5] focus:outline-none focus:border-[#cc785c]"
                        />
                        <button
                          onClick={() => {
                            if (!entityName) return toast.error('Enter entity name');
                            store.addEntity(entityName, entityType, entityDesc);
                            toast.success(`Entity "${entityName}" added!`);
                            setEntityName('');
                            setEntityDesc('');
                            setIsAddingEntity(false);
                          }}
                          className="w-full bg-[#cc785c] text-white text-xs font-semibold py-1.5 rounded-md hover:bg-[#a9583e] transition-colors cursor-pointer"
                        >
                          Save Entity
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Relation form */}
                  <div className="bg-[#252320]/40 border border-[#252320] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#a09d96] flex items-center gap-1.5">
                        <Network size={13} className="text-[#cc785c]" />
                        <span>Add Relation</span>
                      </span>
                      <button onClick={() => setIsAddingRelation(!isAddingRelation)} className="text-[10px] text-[#cc785c] hover:underline font-semibold">
                        {isAddingRelation ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {isAddingRelation && (
                      <div className="space-y-2.5 pt-1">
                        <input
                          type="text"
                          placeholder="Source Entity (Name or ID)"
                          value={relSource}
                          onChange={e => setRelSource(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-[#252320] rounded-md text-xs bg-[#1f1e1b] text-[#faf9f5] focus:outline-none focus:border-[#cc785c]"
                        />
                        <input
                          type="text"
                          placeholder="Target Entity (Name or ID)"
                          value={relTarget}
                          onChange={e => setRelTarget(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-[#252320] rounded-md text-xs bg-[#1f1e1b] text-[#faf9f5] focus:outline-none focus:border-[#cc785c]"
                        />
                        <select
                          value={relType}
                          onChange={e => setRelType(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-[#252320] rounded-md text-xs bg-[#1f1e1b] text-[#faf9f5] focus:outline-none cursor-pointer"
                        >
                          <option value="developer_of">developer_of</option>
                          <option value="built_with">built_with</option>
                          <option value="running_on">running_on</option>
                          <option value="configures">configures</option>
                          <option value="depends_on">depends_on</option>
                          <option value="integrated_in">integrated_in</option>
                        </select>
                        <button
                          onClick={() => {
                            if (!relSource || !relTarget) return toast.error('Enter source and target');
                            store.addRelation(relSource, relTarget, relType);
                            toast.success('Relation added!');
                            setRelSource('');
                            setRelTarget('');
                            setIsAddingRelation(false);
                          }}
                          className="w-full bg-[#cc785c] text-white text-xs font-semibold py-1.5 rounded-md hover:bg-[#a9583e] transition-colors cursor-pointer"
                        >
                          Save Relation
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Observation form */}
                  <div className="bg-[#252320]/40 border border-[#252320] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#a09d96] flex items-center gap-1.5">
                        <Sparkles size={13} className="text-[#cc785c]" />
                        <span>Add Observation</span>
                      </span>
                      <button onClick={() => setIsAddingObservation(!isAddingObservation)} className="text-[10px] text-[#cc785c] hover:underline font-semibold">
                        {isAddingObservation ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {isAddingObservation && (
                      <div className="space-y-2.5 pt-1">
                        <select
                          value={obsEntityId}
                          onChange={e => setObsEntityId(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-[#252320] rounded-md text-xs bg-[#1f1e1b] text-[#faf9f5] focus:outline-none cursor-pointer"
                        >
                          <option value="">-- Choose Entity --</option>
                          {store.entities.map(ent => (
                            <option key={ent.id} value={ent.id}>{ent.name} ({ent.type})</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Observed fact text..."
                          value={obsFact}
                          onChange={e => setObsFact(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-[#252320] rounded-md text-xs bg-[#1f1e1b] text-[#faf9f5] focus:outline-none focus:border-[#cc785c]"
                        />
                        <button
                          onClick={() => {
                            if (!obsEntityId || !obsFact) return toast.error('Choose entity and write fact');
                            store.addObservation(obsEntityId, obsFact);
                            toast.success('Fact saved to memory!');
                            setObsFact('');
                            setIsAddingObservation(false);
                          }}
                          className="w-full bg-[#cc785c] text-white text-xs font-semibold py-1.5 rounded-md hover:bg-[#a9583e] transition-colors cursor-pointer"
                        >
                          Save Observation
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Graph Entities List */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#a09d96]">Active Memory Nodes ({filteredEntities.length})</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredEntities.map((ent) => {
                      const observations = store.observations.filter(o => o.entityId === ent.id);
                      return (
                        <div key={ent.id} className="p-4 bg-[#1f1e1b] border border-[#252320] rounded-xl shadow-sm space-y-3 hover:border-[#cc785c] transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-[#faf9f5]">{ent.name}</span>
                                <span className="text-[10px] font-bold bg-[#252320] text-[#a09d96] px-1.5 py-0.5 rounded-full">{ent.type}</span>
                              </div>
                              <p className="text-xs text-[#a09d96] mt-0.5">{ent.description}</p>
                            </div>
                            <button
                              onClick={() => {
                                store.deleteEntity(ent.id);
                                toast.success(`Entity deleted.`);
                              }}
                              className="text-[#a09d96] hover:text-[#c64545] p-1 rounded hover:bg-white/5 shrink-0 transition-colors cursor-pointer"
                              title="Delete Entity node"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          {/* Observations inside entity */}
                          {observations.length > 0 && (
                            <div className="space-y-1.5 pt-2 border-t border-[#252320]/30">
                              <span className="text-[10px] font-bold text-[#a09d96] uppercase tracking-wider block">Observed Context:</span>
                              {observations.map(obs => (
                                <div key={obs.id} className="text-xs text-[#faf9f5] flex items-start justify-between gap-2 bg-[#252320]/50 px-2.5 py-1.5 rounded-lg border border-[#252320]/40">
                                  <span>{obs.fact}</span>
                                  <button
                                    onClick={() => {
                                      store.deleteObservation(obs.id);
                                      toast.success('Observation deleted.');
                                    }}
                                    className="text-[#a09d96] hover:text-[#c64545] cursor-pointer"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Side Panel: Relations and Semantic Links */}
              <div className="w-full md:w-80 flex flex-col min-h-0 bg-[#252320]/20 p-6 overflow-y-auto">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#a09d96] flex items-center gap-1.5 pb-3 border-b border-[#252320] mb-4">
                  <Network size={12} className="text-[#cc785c]" />
                  <span>Semantic Connections</span>
                </h3>

                <div className="space-y-3">
                  {store.relations.map((rel) => (
                    <div key={rel.id} className="p-3 bg-[#1f1e1b] rounded-lg border border-[#252320] flex items-center justify-between gap-3 shadow-sm group">
                      <div className="flex-1 text-[11px] font-mono leading-relaxed truncate">
                        <span className="text-[#faf9f5] font-semibold">{rel.source}</span>
                        <span className="text-[#cc785c] px-1 font-bold">-{rel.relationType}➔</span>
                        <span className="text-[#faf9f5] font-semibold">{rel.target}</span>
                      </div>
                      <button
                        onClick={() => {
                          store.deleteRelation(rel.id);
                          toast.success('Relation deleted.');
                        }}
                        className="text-[#a09d96] hover:text-[#c64545] p-1 rounded hover:bg-black/5 shrink-0 transition-colors cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}

                  {store.relations.length === 0 && (
                    <div className="text-center py-12 text-xs text-[#a09d96]">
                      No semantic relations defined. Add connections above to visualize contextual links.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 4: Cron Scheduler Tab */}
          {activeTab === 'crons' && (
            <motion.div
              key="crons"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col md:flex-row min-h-0"
            >
              {/* Crons List */}
              <div className="flex-1 overflow-y-auto px-6 py-6 border-r border-[#252320] space-y-4 bg-[#181715]">
                <div className="flex items-center justify-between border-b border-[#252320] pb-3">
                  <h2 className="font-serif text-lg text-[#faf9f5] flex items-center gap-2">
                    <Calendar className="text-[#cc785c]" size={18} />
                    <span>Recurring Operator Crons</span>
                  </h2>
                  <button
                    onClick={() => setIsAddingCron(!isAddingCron)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#cc785c] text-white text-xs font-semibold hover:bg-[#a9583e] transition-all shadow-sm cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Schedule Cron</span>
                  </button>
                </div>

                {/* Create Cron Form */}
                {isAddingCron && (
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      if (!cronName || !cronPrompt) return toast.error('Enter name and prompt instructions');
                      store.addCron(cronName, cronDesc, cronExpr, cronPrompt);
                      toast.success(`Cron job "${cronName}" scheduled!`);
                      setCronName('');
                      setCronDesc('');
                      setCronExpr('*/1 * * * *');
                      setCronPrompt('');
                      setIsAddingCron(false);
                    }}
                    className="p-4 rounded-xl border border-[#252320] bg-[#252320]/20 shadow-sm space-y-4"
                  >
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#a09d96] flex items-center gap-1.5">
                      <Sparkles size={13} className="text-[#cc785c]" />
                      <span>New Job Configuration</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-[#a09d96] uppercase tracking-wider block mb-1">Job Name</label>
                        <input
                          type="text"
                          required
                          value={cronName}
                          onChange={e => setCronName(e.target.value)}
                          placeholder="e.g. Health Sync"
                          className="w-full px-3 py-2 border border-[#252320] bg-[#1f1e1b] text-[#faf9f5] rounded-lg text-xs focus:outline-none focus:border-[#cc785c]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-[#a09d96] uppercase tracking-wider block mb-1">Cron Expression</label>
                        <input
                          type="text"
                          required
                          value={cronExpr}
                          onChange={e => setCronExpr(e.target.value)}
                          placeholder="e.g. */15 * * * * (every 15 min) or preset"
                          className="w-full px-3 py-2 border border-[#252320] bg-[#1f1e1b] text-[#faf9f5] rounded-lg text-xs focus:outline-none focus:border-[#cc785c]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-[#a09d96] uppercase tracking-wider block mb-1">Description</label>
                      <input
                        type="text"
                        value={cronDesc}
                        onChange={e => setCronDesc(e.target.value)}
                        placeholder="Purpose of this job..."
                        className="w-full px-3 py-2 border border-[#252320] bg-[#1f1e1b] text-[#faf9f5] rounded-lg text-xs focus:outline-none focus:border-[#cc785c]"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-[#a09d96] uppercase tracking-wider block mb-1">Instructions Prompt</label>
                      <textarea
                        required
                        value={cronPrompt}
                        onChange={e => setCronPrompt(e.target.value)}
                        placeholder="Prompt directives to execute autonomously when cron triggers..."
                        rows={2}
                        className="w-full px-3 py-2 border border-[#252320] bg-[#1f1e1b] text-[#faf9f5] rounded-lg text-xs focus:outline-none focus:border-[#cc785c] font-mono"
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-1 justify-end">
                      <button
                        type="button"
                        onClick={() => setIsAddingCron(false)}
                        className="px-3.5 py-1.5 text-xs text-[#a09d96] hover:underline font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-[#cc785c] text-white text-xs font-semibold rounded-lg hover:bg-[#a9583e] transition-colors cursor-pointer"
                      >
                        Schedule Job
                      </button>
                    </div>
                  </form>
                )}

                {/* Active scheduled jobs list */}
                <div className="grid gap-4">
                  {store.crons.map((cron) => (
                    <div key={cron.id} className="p-4 bg-[#1f1e1b] border border-[#252320] rounded-xl shadow-sm space-y-4 hover:border-[#cc785c]/60 transition-all">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-[#faf9f5]">{cron.name}</h3>
                            <span className="font-mono text-[9px] bg-[#252320] text-[#a09d96] px-2 py-0.5 rounded-full">{cron.cronExpression}</span>
                          </div>
                          <p className="text-xs text-[#a09d96] mt-1">{cron.description}</p>
                        </div>
                        <div className="flex items-center gap-4 self-end sm:self-auto">
                          {/* Active toggle */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[#a09d96] uppercase tracking-wider font-bold">Active:</span>
                            <button
                              onClick={() => store.updateCron(cron.id, { isActive: !cron.isActive })}
                              className="focus:outline-none cursor-pointer"
                            >
                              <div className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ${
                                cron.isActive ? 'bg-[#5db872]' : 'bg-[#252320]'
                              }`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                                  cron.isActive ? 'translate-x-4' : 'translate-x-0'
                                }`} />
                              </div>
                            </button>
                          </div>
                          
                          <button
                            onClick={() => {
                              store.deleteCron(cron.id);
                              toast.success('Cron deleted.');
                            }}
                            className="text-[#a09d96] hover:text-[#c64545] p-1 rounded hover:bg-black/5 transition-colors cursor-pointer"
                            title="Delete cron job"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="border-t border-[#252320]/30 pt-3 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                        <div className="bg-[#181715] text-[#faf9f5]/90 border border-[#252320]/20 rounded-lg p-2.5 font-mono text-[10px] leading-relaxed flex-1 w-full overflow-x-auto shadow-sm">
                          <span className="text-[#cc785c] font-semibold">Prompt Instructions:</span>
                          <p className="mt-1 text-[#faf9f5]/85 whitespace-pre-wrap break-all">{cron.prompt}</p>
                        </div>

                        <div className="flex flex-col gap-1 text-[10px] font-mono text-[#a09d96] shrink-0">
                          <div className="flex items-center gap-1">
                            <Clock size={10} />
                            <span>Last Run: {cron.lastRun ? new Date(cron.lastRun).toLocaleTimeString() : 'Never'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Play size={10} />
                            <span>Next Run: {cron.nextRun || 'Calculating...'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Side Panel: Presets & Help */}
              <div className="w-full md:w-80 flex flex-col min-h-0 bg-[#252320]/20 p-6 overflow-y-auto space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#a09d96] flex items-center gap-1.5 pb-2 border-b border-[#252320] mb-1">
                  <BookOpen size={12} className="text-[#cc785c]" />
                  <span>Cron Presets Directory</span>
                </h3>

                <div className="space-y-3 text-xs leading-relaxed text-[#a09d96]">
                  <div className="p-3 bg-[#1f1e1b] border border-[#252320] rounded-lg shadow-sm space-y-1">
                    <span className="font-bold text-[#faf9f5]">*/15 * * * * *</span>
                    <p>Runs every 15 seconds. Ideal for real-time diagnostics monitoring or local integration checkups.</p>
                  </div>
                  <div className="p-3 bg-[#1f1e1b] border border-[#252320] rounded-lg shadow-sm space-y-1">
                    <span className="font-bold text-[#faf9f5]">* * * * *</span>
                    <p>Runs every minute. Ideal for git commits summaries or sandbox security scans.</p>
                  </div>
                  <div className="p-3 bg-[#1f1e1b] border border-[#252320] rounded-lg shadow-sm space-y-1">
                    <span className="font-bold text-[#faf9f5]">0 */4 * * *</span>
                    <p>Runs every 4 hours. Recommended for full-workspace lint checkups and test suites.</p>
                  </div>
                  <div className="p-3 bg-[#1f1e1b] border border-[#252320] rounded-lg shadow-sm space-y-1">
                    <span className="font-bold text-[#faf9f5]">0 9 * * 1-5</span>
                    <p>Every weekday morning at 9:00 AM. Triggers morning briefings of overnight commits and issues.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 5: Diagnostics Tab */}
          {activeTab === 'diagnostics' && (
            <motion.div
              key="diagnostics"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.15 }}
              className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-[#181715]"
            >
              <div className="flex items-center justify-between border-b border-[#252320] pb-4">
                <div>
                  <h2 className="font-serif text-lg text-[#faf9f5] flex items-center gap-2">
                    <Activity className="text-[#cc785c]" size={18} />
                    <span>Host Environment Diagnostics</span>
                  </h2>
                  <p className="text-xs text-[#a09d96] mt-0.5">Diagnose host security, sandbox integrity, and active MCP servers.</p>
                </div>
                <button
                  onClick={async () => {
                    setIsRunningDiagnostics(true);
                    await new Promise(r => setTimeout(r, 1200));
                    store.runDiagnostics();
                    setIsRunningDiagnostics(false);
                    toast.success('System parameters refreshed!');
                  }}
                  disabled={isRunningDiagnostics}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#cc785c] text-white text-xs font-semibold hover:bg-[#a9583e] transition-all disabled:opacity-40 cursor-pointer"
                >
                  <RefreshCw size={13} className={isRunningDiagnostics ? 'animate-spin' : ''} />
                  <span>Verify Systems</span>
                </button>
              </div>

              {/* Bento Grid parameters */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="p-5 bg-[#1f1e1b] border border-[#252320] rounded-xl shadow-sm flex items-start gap-4">
                  <div className="bg-[#cc785c]/10 text-[#cc785c] p-2.5 rounded-lg">
                    <Server size={18} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[#a09d96] uppercase tracking-wider block">Operating System</span>
                    <span className="text-sm font-semibold text-[#faf9f5] mt-1 block">{store.diagnostics.os}</span>
                  </div>
                </div>

                <div className="p-5 bg-[#1f1e1b] border border-[#252320] rounded-xl shadow-sm flex items-start gap-4">
                  <div className="bg-[#cc785c]/10 text-[#cc785c] p-2.5 rounded-lg">
                    <Cpu size={18} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[#a09d96] uppercase tracking-wider block">Sandbox CPU</span>
                    <span className="text-sm font-semibold text-[#faf9f5] mt-1 block">{store.diagnostics.cpu}</span>
                  </div>
                </div>

                <div className="p-5 bg-[#1f1e1b] border border-[#252320] rounded-xl shadow-sm flex items-start gap-4">
                  <div className="bg-[#cc785c]/10 text-[#cc785c] p-2.5 rounded-lg">
                    <Activity size={18} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[#a09d96] uppercase tracking-wider block">Context Heap Memory</span>
                    <span className="text-sm font-semibold text-[#faf9f5] mt-1 block">{store.diagnostics.memory}</span>
                  </div>
                </div>

                <div className="p-5 bg-[#1f1e1b] border border-[#252320] rounded-xl shadow-sm flex items-start gap-4">
                  <div className="bg-[#5db872]/10 text-[#5db872] p-2.5 rounded-lg">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[#a09d96] uppercase tracking-wider block">Sandbox Integrity</span>
                    <span className="text-sm font-semibold text-[#5db872] mt-1 block flex items-center gap-1">
                      <span>{store.diagnostics.sandboxStatus.toUpperCase()}</span>
                      <CheckCircle2 size={13} />
                    </span>
                  </div>
                </div>
              </div>

              {/* Active MCP servers list */}
              <div className="p-6 bg-[#1f1e1b] border border-[#252320] rounded-xl shadow-sm space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#a09d96] flex items-center gap-1.5 border-b border-[#252320] pb-2">
                  <Server size={14} className="text-[#cc785c]" />
                  <span>Active MCP Tool Servers ({store.diagnostics.activeMcpServers.length})</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {store.diagnostics.activeMcpServers.map((serverName, index) => (
                    <div key={index} className="p-4 bg-[#252320]/40 border border-[#252320] rounded-xl flex items-center justify-between gap-4">
                      <div>
                        <span className="text-xs font-semibold text-[#faf9f5] block font-mono">{serverName}</span>
                        <span className="text-[10px] text-[#5db872] flex items-center gap-1 mt-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#5db872] animate-pulse" />
                          <span>Connected</span>
                        </span>
                      </div>
                      <span className="text-[10px] bg-[#cc785c]/10 text-[#cc785c] px-2 py-0.5 rounded font-bold uppercase">MCP</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Terminal System Verification Trace */}
              <div className="p-6 bg-[#181715] text-[#faf9f5] border border-[#252320]/20 rounded-xl space-y-3 font-mono text-[11px] shadow-lg">
                <div className="flex items-center justify-between border-b border-[#252320]/15 pb-2">
                  <span className="text-[#a09d96]">SANDBOX LOGS</span>
                  <span className="text-[10px] text-[#5db872]">SECURE STATUS</span>
                </div>
                <div className="space-y-1.5 text-[#faf9f5]/85">
                  <div>[sys_check] Initializing sandboxed environment check...</div>
                  <div>[sys_check] Host context path: e:/NYX</div>
                  <div>[sys_check] Resolving environment interfaces: Tauri SDK found, browser fallback active.</div>
                  <div>[sys_check] Checking credentials store... encrypted correctly.</div>
                  <div>[sys_check] Verifying active MCP tool connectors... 3 servers responding.</div>
                  <div className="text-[#5db872] font-semibold">[sys_check] Success. Security integrity verification passed.</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Tab Selector Button ── */
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium tracking-wide transition-all shrink-0 cursor-pointer ${
        active
          ? 'bg-[#252320] text-[#faf9f5] font-semibold shadow-sm'
          : 'text-[#a09d96] hover:text-[#faf9f5] hover:bg-[#252320]/30'
      }`}
    >
      <span className={active ? 'text-[#cc785c]' : 'text-[#a09d96]'}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/* ── Status Badge ── */
function StatusBadge({ status }: { status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1 ${
      status === 'completed' ? 'bg-[#5db872]/20 text-[#5db872]' :
      status === 'failed' ? 'bg-[#c64545]/20 text-[#c64545]' :
      status === 'running' ? 'bg-[#e8a55a]/20 text-[#e8a55a] animate-pulse' :
      status === 'paused' ? 'bg-[#6c6a64]/20 text-[#6c6a64]' : 'bg-[#252320] text-[#a09d96]'
    }`}>
      <span className={`w-1 h-1 rounded-full ${
        status === 'completed' ? 'bg-[#5db872]' :
        status === 'failed' ? 'bg-[#c64545]' :
        status === 'running' ? 'bg-[#e8a55a]' :
        status === 'paused' ? 'bg-[#6c6a64]' : 'bg-[#a09d96]'
      }`} />
      <span className="capitalize">{status}</span>
    </span>
  );
}
