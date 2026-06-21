import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CaretDown, 
  CaretRight, 
  Globe, 
  PuzzlePiece, 
  Code, 
  FileText, 
  Microscope, 
  Sparkle, 
  Brain, 
  Link, 
  Lightning, 
  ArrowsClockwise, 
  ClipboardText, 
  Warning, 
  MagnifyingGlass, 
  Check, 
  Cpu 
} from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { useSmoothTypewriter } from '../hooks/useSmoothTypewriter';
import { ProgressiveFluxLoader } from '@/components/ui/progressive-flux-loader';

const THINKING_PHASES = [
  { at: 0, label: "analyzing intent" },
  { at: 25, label: "searching codebase" },
  { at: 55, label: "synthesizing solution" },
  { at: 80, label: "refining response" },
  { at: 100, label: "executing plan" },
];


interface ThinkingBlockProps {
  content: string;
  responseContent?: string;
  isComplete?: boolean;
  startedAt?: number;
  agentProgress?: {
    step: number;
    total: number;
    currentAgent?: string;
    elapsed?: number;
  };
}

// ─── Phase detection ───────────────────────────────────────────────────────────
type ThinkingPhase = 'analyzing' | 'tool_evaluating' | 'synthesizing' | 'complete';

function detectPhase(content: string): ThinkingPhase {
  if (!content || content.length < 10) return 'analyzing';
  const scanArea = content.length > 2000 ? content.slice(-1500) : content;
  const lower = scanArea.toLowerCase();
  
  const toolIdx = Math.max(
    lower.lastIndexOf('tool'),
    lower.lastIndexOf('function'),
    lower.lastIndexOf('search'),
    lower.lastIndexOf('calling')
  );
  
  const synthIdx = Math.max(
    lower.lastIndexOf('therefore'),
    lower.lastIndexOf('in conclusion'),
    lower.lastIndexOf('based on'),
    lower.lastIndexOf('the answer'),
    lower.lastIndexOf('finally'),
    lower.lastIndexOf('crafting'),
    lower.lastIndexOf('polisher')
  );

  if (synthIdx > toolIdx && synthIdx > -1) {
    return 'synthesizing';
  }
  
  if (toolIdx > -1) {
    return 'tool_evaluating';
  }
  
  return 'analyzing';
}

const PHASE_CONFIG: Record<ThinkingPhase, { label: string; color: string; icon: string }> = {
  analyzing:      { label: 'Analyzing',        color: '#818CF8',              icon: '◎' },
  tool_evaluating:{ label: 'Evaluating Tools', color: '#F59E0B',              icon: '⚡' },
  synthesizing:   { label: 'Synthesizing',     color: '#34D399',              icon: '✦' },
  complete:       { label: 'Complete',         color: 'rgba(255,255,255,0.3)', icon: '✓' },
};

// Parse structured thinking content into typed segments
type Segment =
  | { type: 'section'; label: string; icon: string }
  | { type: 'agent_start'; agent: string }
  | { type: 'agent_end'; agent: string }
  | { type: 'task_start'; index: string; agent: string; task: string }
  | { type: 'dynamic_spawn'; agent: string; task: string }
  | { type: 'batch_complete' }
  | { type: 'tool_call'; agent: string; tool: string; args: string }
  | { type: 'tool_result'; preview: string }
  | { type: 'plan'; agents: string[] }
  | { type: 'agent_progress'; step: number; total: number; agents?: string[]; currentAgent?: string; elapsed?: number }
  | { type: 'text'; content: string };

const AGENT_MAPPING: Record<string, string> = {
  web_explorer: 'Web Explorer',
  doc_cruncher: 'Document Cruncher',
  code_interpreter: 'Code Interpreter',
  deep_planner: 'Deep Planner',
  deep_research: 'Deep Research',
  persona_polisher: 'Persona & Polisher',
};

function normalizeAgent(name: string): string {
  const trimmed = name.trim();
  const mapped = AGENT_MAPPING[trimmed] || AGENT_MAPPING[trimmed.toLowerCase().replace(/\s+/g, '_')];
  if (mapped) return mapped;
  return trimmed.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function parseThinking(raw: string): Segment[] {
  if (raw.length > 10000 && !raw.includes('━━━') && !raw.includes('┌─') && !raw.includes('⚡') && !raw.includes('📋') && !raw.includes('Plan:') && !raw.includes('Agent turn') && !raw.includes('Executing tool')) {
    return [{ type: 'text', content: raw }];
  }

  const lines = raw.split('\n');
  const segments: Segment[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // Agent turn header: Agent turn 1/15…
    const turnMatch = t.match(/^Agent\s+turn\s+(\d+)\/(\d+)/i);
    if (turnMatch) {
      segments.push({ type: 'section', label: `Agent Turn ${turnMatch[1]}/${turnMatch[2]}`, icon: 'arrows_clockwise' });
      continue;
    }

    // Tool call: Executing tool: web_search...
    const execToolMatch = t.match(/^Executing\s+tool:\s*(\w+)/i);
    if (execToolMatch) {
      segments.push({ type: 'tool_call', agent: 'Agent', tool: execToolMatch[1], args: '' });
      continue;
    }

    // Tool result: Tool result received.
    if (t.toLowerCase().includes('tool result received')) {
      segments.push({ type: 'tool_result', preview: 'Result received successfully.' });
      continue;
    }

    // Section header: 🔄 [ReAct Loop] Iteration 1
    const reactLoopMatch = t.match(/🔄\s+\[ReAct\s+Loop\]\s+Iteration\s+(\d+)/i);
    if (reactLoopMatch) {
      segments.push({ type: 'section', label: `ReAct Loop Iteration ${reactLoopMatch[1]}`, icon: 'arrows_clockwise' });
      continue;
    }

    // Tool call: 🛠️ [Executing Tool] web_search ({...})
    const tauriExecToolMatch = t.match(/🛠️\s+\[Executing\s+Tool\]\s+(\w+)\s*\((.*?)\)/i);
    if (tauriExecToolMatch) {
      segments.push({ type: 'tool_call', agent: 'Agent', tool: tauriExecToolMatch[1], args: tauriExecToolMatch[2] || '' });
      continue;
    }

    // Connection messages
    if (t.startsWith('━━━') || t.includes('Routing') || t.includes('Supervisor')) {
      segments.push({ type: 'section', label: t.replace(/^[━\s]+|[━\s]+$/g, '').trim(), icon: 'brain' });
      continue;
    }

    // section header: ━━━ [Label] Text ━━━
    const sec = t.match(/^[━]+\s+\[(.+?)\]\s+(.+?)\s+[━]+$/);
    if (sec) {
      const label = sec[1] + ' ' + sec[2].replace(/\.\.\.$/, '').trim();
      const icon = label.includes('Supervisor') || label.includes('Routing') ? 'brain'
        : label.includes('Polisher') || label.includes('Crafting') ? 'sparkle'
        : label.includes('Synthesis') ? 'link'
        : label.includes('Running') ? 'lightning'
        : 'arrows_clockwise';
      segments.push({ type: 'section', label, icon });
      continue;
    }
    // plan: 🗺️ Plan: a → b
    const plan = t.match(/Plan:\s+(.+)$/);
    if (plan) {
      const agents = plan[1].split(/\s*[→>]\s*/).map((a: string) => normalizeAgent(a)).filter(Boolean);
      segments.push({ type: 'plan', agents });
      continue;
    }
    // agent start: ┌─ [Name] ...
    const astart = t.match(/^[┌├]─\s+\[(.+?)\]/);
    if (astart) { segments.push({ type: 'agent_start', agent: normalizeAgent(astart[1]) }); continue; }
    // agent end: └─ [Name] ...
    const aend = t.match(/^└─\s+\[(.+?)\]/);
    if (aend) { segments.push({ type: 'agent_end', agent: normalizeAgent(aend[1]) }); continue; }
    // task start: ┌─ Task 1 (web_explorer): ...
    const taskStart = t.match(/^[┌├]─\s+Task\s+(\d+)\s+\((.+?)\):\s*(.*)$/);
    if (taskStart) {
      segments.push({ type: 'task_start', index: taskStart[1], agent: normalizeAgent(taskStart[2]), task: taskStart[3] });
      continue;
    }
    // dynamic spawn: ├─ ⚡ Dynamically spawning sub-agent: web_explorer for: task instructions
    const dynamicSpawn = t.match(/^[┌├]─\s+\u26A1\s+Dynamically spawning sub-agent:\s*(.+?)\s+for:\s*(.*)$/);
    if (dynamicSpawn) {
      segments.push({ type: 'dynamic_spawn', agent: normalizeAgent(dynamicSpawn[1]), task: dynamicSpawn[2] });
      continue;
    }
    // batch complete: └─ Batch complete.
    if (/^└─\s+Batch\s+complete\./.test(t)) {
      segments.push({ type: 'batch_complete' });
      continue;
    }
    // tool call: ⚡ [Name] → tool(args)
    const tc = t.match(/^\u26A1\s+\[(.+?)\]\s+[→>]\s+(\w+)\((.*)?\)$/);
    if (tc) { segments.push({ type: 'tool_call', agent: normalizeAgent(tc[1]), tool: tc[2], args: tc[3] || '' }); continue; }
    // tool result: 📋 Result: ...
    const tr = t.match(/^\uD83D\uDCCB\s+Result:\s+(.+)$/);
    if (tr) { segments.push({ type: 'tool_result', preview: tr[1] }); continue; }
    // plain text
    const prev = segments[segments.length - 1];
    if (prev && prev.type === 'text') { prev.content += '\n' + t; }
    else { segments.push({ type: 'text', content: t }); }
  }
  return segments;
}

const AGENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Web Explorer':       { bg: 'bg-card',  text: 'text-foreground', border: 'border-border' },
  'Deep Planner':       { bg: 'bg-card',  text: 'text-foreground', border: 'border-border' },
  'Code Interpreter':   { bg: 'bg-card',  text: 'text-foreground', border: 'border-border' },
  'Document Cruncher':  { bg: 'bg-card',  text: 'text-foreground', border: 'border-border' },
  'Deep Research':      { bg: 'bg-card',  text: 'text-foreground', border: 'border-border' },
  'Persona & Polisher': { bg: 'bg-card',  text: 'text-foreground', border: 'border-border' },
};

function getAgentColor(agent: string) {
  return AGENT_COLORS[agent] || { bg: 'bg-card', text: 'text-foreground', border: 'border-border' };
}

function getAgentIcon(agent: string, className = "w-3.5 h-3.5") {
  switch (normalizeAgent(agent)) {
    case 'Web Explorer': return <Globe className={className} />;
    case 'Deep Planner': return <PuzzlePiece className={className} />;
    case 'Code Interpreter': return <Code className={className} />;
    case 'Document Cruncher': return <FileText className={className} />;
    case 'Deep Research': return <Microscope className={className} />;
    case 'Persona & Polisher': return <Sparkle className={className} />;
    default: return <Brain className={className} />;
  }
}

function getIconFromEmoji(key: string, className = "w-3.5 h-3.5") {
  switch (key) {
    case 'brain': return <Brain className={className} />;
    case 'sparkle': return <Sparkle className={className} />;
    case 'link': return <Link className={className} />;
    case 'lightning': return <Lightning className={className} />;
    case 'arrows_clockwise': return <ArrowsClockwise className={className} />;
    case 'globe': return <Globe className={className} />;
    case 'puzzle_piece': return <PuzzlePiece className={className} />;
    case 'code': return <Code className={className} />;
    case 'file_text': return <FileText className={className} />;
    case 'microscope': return <Microscope className={className} />;
    case 'clipboard_text': return <ClipboardText className={className} />;
    default: return null;
  }
}

// ─── Step Timeline layout structures ──────────────────────────────────────────
export type PlanStepStatus = 'pending' | 'active' | 'success' | 'error';

interface GroupedStep {
  id: string;
  title: string;
  status: PlanStepStatus;
  icon?: React.ReactNode;
  duration?: string;
  contentNodes: Segment[];
}

function groupSegmentsToSteps(segments: Segment[], isComplete: boolean): GroupedStep[] {
  const steps: GroupedStep[] = [];
  let currentStep: GroupedStep | null = null;
  let stepCounter = 0;

  const createStep = (title: string, status: PlanStepStatus, icon?: React.ReactNode) => {
    const prevStep = currentStep as GroupedStep | null;
    if (prevStep) {
      if (prevStep.status === 'active') {
        prevStep.status = 'success';
      }
    }
    stepCounter++;
    currentStep = {
      id: String(stepCounter),
      title,
      status,
      icon,
      contentNodes: []
    };
    steps.push(currentStep);
  };

  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx];
    const isLastSegment = idx === segments.length - 1;

    // Detect explicit step markers
    if (seg.type === 'section') {
      const icon = getIconFromEmoji(seg.icon) || <Brain className="w-3.5 h-3.5" />;
      createStep(seg.label, isLastSegment && !isComplete ? 'active' : 'success', icon);
    } 
    else if (seg.type === 'agent_start') {
      const icon = getAgentIcon(seg.agent, "w-3.5 h-3.5");
      createStep(`${seg.agent} turn`, isLastSegment && !isComplete ? 'active' : 'success', icon);
    }
    else if (seg.type === 'agent_end') {
      const agentStep = [...steps].reverse().find(s => s.title.includes(seg.agent));
      if (agentStep) {
        agentStep.status = 'success';
      }
    }
    else if (seg.type === 'task_start') {
      const icon = getAgentIcon(seg.agent, "w-3.5 h-3.5");
      createStep(`Task ${seg.index}: ${seg.task}`, isLastSegment && !isComplete ? 'active' : 'success', icon);
    }
    else if (seg.type === 'dynamic_spawn') {
      const icon = <Lightning className="w-3.5 h-3.5" />;
      createStep(`Spawning Sub-agent: ${seg.agent}`, isLastSegment && !isComplete ? 'active' : 'success', icon);
      const activeStep = currentStep as GroupedStep | null;
      if (activeStep) {
        activeStep.contentNodes.push(seg);
      }
    }
    else if (seg.type === 'batch_complete') {
      const activeStep = currentStep as GroupedStep | null;
      if (activeStep) {
        activeStep.status = 'success';
      }
      createStep(`Parallel Batch Complete`, 'success', <Check className="w-3.5 h-3.5" />);
    }
    else {
      // Append to the current active step
      if (!currentStep) {
        createStep('Analysis & Planning', isLastSegment && !isComplete ? 'active' : 'success', <MagnifyingGlass className="w-3.5 h-3.5" />);
      }
      const activeStep = currentStep as GroupedStep | null;
      if (activeStep) {
        activeStep.contentNodes.push(seg);
      }
    }
  }

  // Finalize last step status
  const finalStep = currentStep as GroupedStep | null;
  if (finalStep && isComplete) {
    if (finalStep.status === 'active') {
      finalStep.status = 'success';
    }
  }

  return steps;
}

// ─── Inline Timeline rendering nodes ──────────────────────────────────────────

const PlanPill: React.FC<{ agents: string[] }> = ({ agents }) => (
  <div className="flex items-center gap-2 flex-wrap py-1.5 select-none relative">
    <span className="text-[13px] font-mono text-muted-foreground mr-1 uppercase">Plan:</span>
    {agents.map((a, i) => {
      const normAgent = normalizeAgent(a);
      return (
        <React.Fragment key={a}>
          <span className="text-[13px] font-mono font-medium px-2 py-0.5 rounded-lg border border-border text-foreground bg-card flex items-center gap-1.5">
            {getAgentIcon(normAgent, "w-3 h-3")} {normAgent}
          </span>
          {i < agents.length - 1 && <CaretRight className="w-3 h-3 text-muted-foreground shrink-0" />}
        </React.Fragment>
      );
    })}
  </div>
);

const DynamicSpawnNode: React.FC<{ agent: string; task: string }> = ({ agent, task }) => {
  const normAgent = normalizeAgent(agent);
  return (
    <div className="relative flex items-start gap-3 p-4 bg-card rounded-[16px] border border-border my-2">
      <span className="text-[13px] font-mono font-medium px-2 py-0.5 rounded-lg border border-border shrink-0 flex items-center gap-1.5 text-foreground">
        {getAgentIcon(normAgent, "w-3 h-3")} {normAgent}
      </span>
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider font-semibold">Sub-agent Spawned</span>
        <span className="text-[13px] font-mono text-foreground leading-relaxed mt-1 select-text">{task}</span>
      </div>
    </div>
  );
};

const ToolCallNode: React.FC<{ agent: string; tool: string; args: string }> = ({ agent, tool, args }) => {
  const [prettyArgs, isMultiline] = useMemo(() => {
    if (!args.trim()) return ['', false];
    try {
      const parsed = JSON.parse(args);
      const keys = Object.keys(parsed);
      if (keys.length === 1 && typeof parsed[keys[0]] === 'string' && parsed[keys[0]].length < 60) {
        return [parsed[keys[0]], false];
      }
      return [JSON.stringify(parsed, null, 2), true];
    } catch {
      return [args, args.includes('\n') || args.length > 60];
    }
  }, [args]);

  return (
    <div className="flex flex-col gap-1 py-1.5 relative">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-mono text-muted-foreground uppercase select-none">Tool Call:</span>
        <span className="text-[13px] font-mono font-medium px-2 py-0.5 rounded-lg border border-border text-foreground bg-card">{tool}</span>
        {!isMultiline && prettyArgs && (
          <span className="text-[13px] font-mono text-muted-foreground truncate max-w-[300px] select-all">({prettyArgs})</span>
        )}
      </div>
      {isMultiline && prettyArgs && (
        <div className="mt-2 p-3 rounded-[16px] bg-card border border-border text-[13px] font-mono text-foreground max-w-[95%] overflow-x-auto select-text scrollbar-thin leading-relaxed max-h-[180px]">
          <pre className="m-0 font-mono whitespace-pre-wrap break-all">{prettyArgs}</pre>
        </div>
      )}
    </div>
  );
};

const ToolResultNode: React.FC<{ preview: string }> = ({ preview }) => (
  <div className="flex items-start gap-2 py-1.5 relative">
    <span className="text-[13px] font-mono text-muted-foreground uppercase select-none pt-0.5">Response:</span>
    <span className="text-[13px] font-mono text-foreground leading-relaxed break-all max-w-[85%] select-text bg-card border border-border rounded-lg px-2 py-0.5">
      {preview.length > 200 ? preview.slice(0, 200) + '...' : preview}
    </span>
  </div>
);

const PlainTextNode: React.FC<{ content: string }> = ({ content }) => {
  if (!content.trim()) return null;
  return (
    <div className="text-[15px] font-sans leading-relaxed py-2 text-foreground relative">
      <div className="prose prose-sm max-w-none text-foreground select-text">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm, remarkMath]} 
          rehypePlugins={[rehypeKatex]}
          components={{
            p: ({ children }) => <p className="mb-3 last:mb-0 text-[15px] leading-relaxed">{children}</p>,
            ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 my-2">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 my-2">{children}</ol>,
            li: ({ children }) => <li className="marker:text-muted-foreground">{children}</li>,
            code: ({ children }) => <code className="bg-card px-1.5 py-0.5 rounded-lg border border-border text-[13px] font-mono text-foreground">{children}</code>
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};

function AgentProgressBar({
  step,
  total,
  currentAgent,
  elapsed,
}: {
  step: number;
  total: number;
  currentAgent?: string;
  elapsed?: number;
}) {
  const pct = total > 0 ? Math.round((step / total) * 100) : 0;
  const elapsedSec = elapsed ? Math.round(elapsed / 1000) : 0;
  const agentLabel = currentAgent ? normalizeAgent(currentAgent) : '';

  return (
    <div className="my-4 mx-0 p-4 rounded-[16px] bg-card border border-border select-none">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-mono text-muted-foreground uppercase tracking-wider">Agent Turn {step}/{total}</span>
          {agentLabel && (
            <>
              <span className="text-[11px] text-[#DADCE0]">•</span>
              <span className={`text-[13px] font-mono font-medium flex items-center gap-1.5 text-foreground`}>
                {getAgentIcon(agentLabel, "w-4 h-4")} {agentLabel}
              </span>
            </>
          )}
        </div>
        {elapsedSec > 0 && (
          <span className="text-[13px] font-mono text-muted-foreground">{elapsedSec}s</span>
        )}
      </div>
      <div className="h-[1px] bg-[#DADCE0] relative overflow-hidden">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      </div>
    </div>
  );
}

// ─── ThinkingBlock Redesign ───────────────────────────────────────────────────

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ content, responseContent, isComplete = true, startedAt, agentProgress }) => {
  const [isExpanded, setIsExpanded] = useState(!isComplete);
  const showReasoning = useNyxStore((s) => s.showReasoning);
  const setShowReasoning = useNyxStore((s) => s.setShowReasoning);
  
  // Balance code blocks dynamically to prevent markdown thrashing during active streaming
  const balancedContent = useMemo(() => {
    if (isComplete) return content;
    let safeText = content;
    const codeBlockMatches = safeText.match(/```/g);
    if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
      safeText += '\n```';
    }
    return safeText;
  }, [content, isComplete]);
  
  // Parse flat segments
  const segments = useMemo(() => parseThinking(balancedContent), [balancedContent]);
  
  // Dynamic timeline step grouping
  const steps = useMemo(() => groupSegmentsToSteps(segments, isComplete), [segments, isComplete]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [internalStartedAt] = useState(() => startedAt || Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (isComplete) return;
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - internalStartedAt);
    }, 100);
    return () => clearInterval(interval);
  }, [isComplete, internalStartedAt]);

  const currentPhase: ThinkingPhase = useMemo(() => {
    if (isComplete) return 'complete';
    return detectPhase(balancedContent);
  }, [balancedContent, isComplete]);

  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isComplete) {
      setProgress(100);
      return;
    }
    let target = 15;
    if (currentPhase === 'analyzing') {
      target = 25;
    } else if (currentPhase === 'tool_evaluating') {
      target = 60;
    } else if (currentPhase === 'synthesizing') {
      target = 85;
    }
    
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev < target) {
          return Math.min(target, prev + 2);
        } else if (prev > target) {
          return Math.max(target, prev - 2);
        }
        return prev;
      });
    }, 150);

    return () => clearInterval(timer);
  }, [currentPhase, isComplete]);


  // Extract unique active agents and tools
  const activeProcessesText = useMemo(() => {
    const processes: string[] = [];
    segments.forEach(s => {
      if (s.type === 'agent_start' || s.type === 'task_start') {
        const norm = normalizeAgent(s.agent);
        if (norm && !processes.includes(norm)) {
          processes.push(norm);
        }
      }
      if (s.type === 'tool_call') {
        if (s.tool && !processes.includes(s.tool)) {
          processes.push(s.tool);
        }
      }
    });
    if (processes.length === 0) return '';
    return `(${processes.join(', ')})`;
  }, [segments]);

  const currentStatusText = useMemo(() => {
    if (isComplete) return 'Complete';
    
    for (let i = segments.length - 1; i >= 0; i--) {
      const s = segments[i];
      if (s.type === 'tool_call') {
        return `${s.agent} running ${s.tool}...`;
      }
      if (s.type === 'agent_start') {
        return `${s.agent} is working...`;
      }
      if (s.type === 'dynamic_spawn') {
        return `Spawning ${s.agent}...`;
      }
      if (s.type === 'text' && s.content.trim()) {
        const clean = s.content.replace(/\s+/g, ' ').trim();
        if (clean.includes('Connecting to backend agent service')) continue;
        if (clean.length <= 60) return clean;
        return '...' + clean.slice(-55).trim();
      }
    }
    
    return PHASE_CONFIG[currentPhase].label;
  }, [segments, isComplete, currentPhase]);

  const userScrolledUp = useRef(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distanceFromBottom > 50;
  };

  useEffect(() => {
    if (scrollRef.current && !userScrolledUp.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps, isExpanded]);

  if (!content?.trim()) return null;

  const getStatusColor = (status: PlanStepStatus) => {
    switch (status) {
      case 'success': 
        return 'bg-transparent text-foreground border border-border';
      case 'active': 
        return 'bg-primary text-primary-foreground border border-[#202124]';
      case 'error': 
        return 'bg-transparent text-rose-600 border border-rose-200';
      case 'pending': 
        return 'bg-transparent text-muted-foreground border border-border border-dashed';
    }
  };

  if (!showReasoning) {
    const timeSecs = elapsedMs > 0 ? (elapsedMs / 1000).toFixed(1) : ((Date.now() - internalStartedAt) / 1000).toFixed(1);
    return (
      <div className="my-4 flex items-center select-none animate-fade-in group w-full">
        <div 
          onClick={() => setShowReasoning(true)}
          className="w-full flex flex-col bg-card border-y border-border py-2 px-4 cursor-pointer hover:bg-muted transition-colors duration-150 ease-out active:scale-[0.99]"
        >
          <div className="flex items-center justify-between w-full text-[13px] font-mono text-muted-foreground tracking-wide">
            <span className="flex items-center gap-3">
              <span className="uppercase text-foreground font-medium">
                {isComplete ? 'Reasoning Complete' : 'Thinking'}
              </span>
              {!isComplete && currentStatusText && (
                <span className="text-muted-foreground truncate max-w-[300px]">({currentStatusText})</span>
              )}
              {isComplete && activeProcessesText && (
                <span className="text-muted-foreground truncate max-w-[300px]">{activeProcessesText}</span>
              )}
            </span>
            <span className="flex items-center gap-4">
              <span>{timeSecs}s</span>
              <CaretDown weight="bold" className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
            </span>
          </div>
          {!isComplete && (
            <div className="w-full h-[1px] bg-[#DADCE0] mt-2 overflow-hidden relative">
              <motion.div 
                className="h-full bg-primary"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  const customTransition = { type: "spring", stiffness: 300, damping: 30 };
  const hasActive = steps.some(s => s.status === 'active');
  const allSuccess = steps.length > 0 && steps.every(s => s.status === 'success');

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={customTransition}
      className="my-6 mb-8 overflow-hidden"
    >
      <div className="px-0.5">
        {/* Sleek Outer Card Trigger */}
        {!isComplete ? (
          <button
            onClick={() => setIsExpanded(v => !v)}
            className={`w-full text-left outline-none cursor-pointer group bg-card border border-border p-5 rounded-[16px] flex flex-col gap-4 relative overflow-hidden transition-all duration-150 ease-out select-none active:scale-[0.99]
              ${isExpanded ? 'rounded-b-none border-b-transparent' : 'hover:bg-muted'}
            `}
          >
            <div className="absolute top-1/2 -translate-y-1/2 right-4 flex items-center gap-2.5 select-none z-10">
              <span className="text-[13px] font-mono text-muted-foreground mr-2">
                {elapsedMs > 0 ? (elapsedMs / 1000).toFixed(1) : ((Date.now() - internalStartedAt) / 1000).toFixed(1)}s
              </span>
              <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={customTransition}>
                <CaretDown weight="bold" className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </motion.div>
            </div>

            <div className="flex flex-col gap-2 relative z-0 pr-20">
              <span className="text-[13px] font-mono font-medium tracking-widest uppercase text-foreground">
                {PHASE_CONFIG[currentPhase].label}
              </span>
              <div className="h-[1px] bg-[#DADCE0] w-full overflow-hidden relative">
                <motion.div 
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              </div>
            </div>
          </button>
        ) : (
          <button
            onClick={() => setIsExpanded(v => !v)}
            className={`w-full flex items-center justify-between outline-none cursor-pointer group bg-card border border-border p-3 px-4 rounded-[16px] transition-all duration-150 ease-out select-none active:scale-[0.99]
              ${isExpanded ? 'rounded-b-none border-b-transparent' : 'hover:bg-muted'}
            `}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-[13px] font-mono text-foreground font-medium truncate uppercase tracking-widest">
                Reasoning Complete
              </span>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 pl-2">
              {elapsedMs > 0 && (
                <span className="text-[13px] font-mono text-muted-foreground mr-2">
                  {(elapsedMs / 1000).toFixed(1)}s
                </span>
              )}
              <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={customTransition}>
                <CaretDown weight="bold" className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </motion.div>
            </div>
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0, clipPath: 'inset(0% 0% 100% 0%)' }}
            animate={{ height: 'auto', opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }}
            exit={{ height: 0, opacity: 0, clipPath: 'inset(0% 0% 100% 0%)' }}
            transition={customTransition}
            className="overflow-hidden bg-card border border-border border-t-0 rounded-b-[16px]"
          >
            {agentProgress && agentProgress.total > 0 && (
              <AgentProgressBar
                step={agentProgress.step}
                total={agentProgress.total}
                currentAgent={agentProgress.currentAgent}
                elapsed={agentProgress.elapsed}
              />
            )}
            
            {/* Timeline Steps Area */}
            <div 
              ref={scrollRef} 
              onScroll={handleScroll} 
              className="p-6 flex flex-col max-h-[600px] overflow-y-auto overscroll-contain scrollbar-thin space-y-2"
            >
              {steps.map((step, index) => {
                const isLast = index === steps.length - 1;
                
                return (
                  <div 
                    key={step.id} 
                    className={`relative flex gap-5 animate-fade-in
                      ${step.status === 'pending' ? 'opacity-60' : 'opacity-100'}
                    `}
                  >
                    {/* Timeline connecting line */}
                    {!isLast && (
                      <div className="absolute left-[11px] top-8 bottom-[-16px] w-[1px] bg-[#DADCE0] z-0" />
                    )}

                    {/* Icon Column */}
                    <div className="relative z-10 flex-none w-6 h-6 mt-1">
                      <div className={`flex items-center justify-center w-full h-full rounded-lg transition-all duration-300
                        ${getStatusColor(step.status)}
                      `}>
                        {step.status === 'success' ? (
                          <Check className="w-3 h-3 font-bold" />
                        ) : step.status === 'active' ? (
                          <ArrowsClockwise className="w-3 h-3 animate-spin text-foreground" />
                        ) : (
                          step.icon || <div className="w-1.5 h-1.5 rounded-full bg-current" />
                        )}
                      </div>
                    </div>

                    {/* Content Column */}
                    <div className="flex-1 pb-6">
                      {/* Step Header */}
                      <div className="flex items-center justify-between group rounded-md -mx-2 px-2 py-0.5 select-none">
                        <span className={`text-[13px] font-mono font-semibold uppercase tracking-wider transition-colors duration-200
                          ${step.status === 'active' ? 'text-foreground' : 
                            step.status === 'error' ? 'text-rose-600' : 
                            'text-muted-foreground'}
                        `}>
                          {step.title}
                        </span>

                        {step.duration && (
                          <span className="text-[13px] font-mono text-muted-foreground tabular-nums">
                            {step.duration}
                          </span>
                        )}
                      </div>

                      {/* Step Content Nodes (Always visible) */}
                      {step.contentNodes.length > 0 && (
                        <div className="mt-2 opacity-100">
                          <div className="pt-1 pb-2 pl-1 space-y-2.5">
                            {step.contentNodes.map((node, nIdx) => {
                              switch (node.type) {
                                case 'plan':          return <PlanPill key={nIdx} agents={node.agents} />;
                                case 'dynamic_spawn': return <DynamicSpawnNode key={nIdx} agent={node.agent} task={node.task} />;
                                case 'tool_call':     return <ToolCallNode key={nIdx} agent={node.agent} tool={node.tool} args={node.args} />;
                                case 'tool_result':   return <ToolResultNode key={nIdx} preview={node.preview} />;
                                case 'text':          return <PlainTextNode key={nIdx} content={node.content} />;
                                default:              return null;
                              }
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
