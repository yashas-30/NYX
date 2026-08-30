import React, { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertTriangle, Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import { ToolCall } from '@nyx/shared';

export const formatToolAction = (rawName: any, argsInput: any, status: string) => {
  const name = typeof rawName === 'string' ? rawName : rawName ? String(rawName) : 'tool';
  let args: any = {};
  if (typeof argsInput === 'object' && argsInput !== null) {
    args = argsInput;
  } else if (typeof argsInput === 'string') {
    try {
      args = JSON.parse(argsInput || '{}');
    } catch {}
  }

  const isDone = status === 'completed' || status === 'success';
  const prefix = isDone ? 'Finished' : status === 'error' ? 'Failed to' : 'Using';

  switch (name) {
    case 'searchWeb':
    case 'web_search':
      return isDone ? 'Searched the web' : 'Searching the web...';
    case 'agent_handoff':
      return isDone
        ? `Received context from ${args.agent || 'agent'}`
        : `Handed off task to ${args.agent || 'agent'}...`;
    case 'calculator':
      return isDone ? 'Calculated result' : 'Calculating...';
    case 'getWeather':
      return isDone
        ? `Checked weather for ${args.location || 'location'}`
        : `Checking weather for ${args.location || 'location'}...`;
    case 'run_python':
    case 'python':
      return isDone ? 'Ran Python code' : 'Running Python code...';
    case 'read_file':
      return isDone ? 'Read file contents' : 'Reading file...';
    case 'list_dir':
      return isDone ? 'Listed directory contents' : 'Listing directory...';
    default: {
      const formattedName = name
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .trim();
      return `${prefix} ${formattedName.toLowerCase()}...`;
    }
  }
};

export const ToolCallCard: React.FC<{
  tool: ToolCall;
  status: 'pending' | 'running' | 'completed' | 'success' | 'error';
}> = memo(({ tool, status }) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning = status === 'running';
  const isError = status === 'error';

  const toolName = tool?.function?.name || (tool as any)?.name || (tool as any)?.tool || 'tool';
  const rawArgs =
    tool?.function?.arguments || (tool as any)?.args || (tool as any)?.arguments || '{}';
  const actionText = formatToolAction(toolName, rawArgs, status);

  let formattedArgs = rawArgs;
  if (typeof rawArgs === 'string') {
    try {
      formattedArgs = JSON.stringify(JSON.parse(rawArgs || '{}'), null, 2);
    } catch {
      formattedArgs = rawArgs;
    }
  } else if (typeof rawArgs === 'object' && rawArgs !== null) {
    formattedArgs = JSON.stringify(rawArgs, null, 2);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 flex flex-col group"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-fit flex items-center gap-2 px-3 py-1.5 rounded-full text-left cursor-pointer bg-muted/30 hover:bg-muted/60 transition-colors border border-border/50"
      >
        {isRunning ? (
          <Loader2 size={12} className="text-muted-foreground animate-spin shrink-0" />
        ) : isError ? (
          <AlertTriangle size={12} className="text-red-400 shrink-0" />
        ) : (
          <Wrench size={12} className="text-muted-foreground shrink-0" />
        )}
        <span className="text-[12px] font-medium text-muted-foreground truncate max-w-[250px]">
          {actionText}
        </span>
        {expanded ? (
          <ChevronDown size={12} className="text-muted-foreground/60 shrink-0 ml-1" />
        ) : (
          <ChevronRight size={12} className="text-muted-foreground/60 shrink-0 ml-1" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden w-full mt-2"
          >
            <div className="pl-4 border-l border-border/40 ml-2 py-1">
              <div className="text-[10px] text-muted-foreground/80 font-mono mb-1 uppercase tracking-wider">
                {toolName} Inputs
              </div>
              <pre className="text-[11px] font-mono text-foreground/80 bg-muted/20 rounded-md p-3 overflow-x-auto border border-border/30">
                {formattedArgs}
              </pre>

              {tool.result && (
                <div className="mt-3">
                  <div className="text-[10px] text-muted-foreground/80 font-mono mb-1 uppercase tracking-wider">
                    Result
                  </div>
                  <pre className="text-[11px] font-mono text-foreground/80 bg-muted/20 rounded-md p-3 overflow-x-auto border border-border/30 max-h-[300px] overflow-y-auto">
                    {tool.result}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
ToolCallCard.displayName = 'ToolCallCard';
