import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Play, X, RotateCcw } from 'lucide-react';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { motion, AnimatePresence } from 'framer-motion';

interface InlineREPLProps {
  onClose?: () => void;
}

export const InlineREPL: React.FC<InlineREPLProps> = ({ onClose }) => {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<{ command: string; output: string; status: 'success' | 'error' }[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [history]);

  const handleRun = async () => {
    if (!command.trim() || isRunning) return;

    const currentCmd = command;
    setCommand('');
    setIsRunning(true);

    try {
      const response = await fetchWithAuth('/api/v1/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: currentCmd }),
      });
      const data = await response.json();
      
      let output = '';
      let status: 'success' | 'error' = 'success';
      
      if (data.stdout) output += data.stdout;
      if (data.stderr) {
        output += `\n${data.stderr}`;
        status = 'error';
      }
      if (data.error) {
        output += `\nError: ${data.error}`;
        status = 'error';
      }
      
      setHistory(prev => [...prev, { command: currentCmd, output: output || 'Success (no output)', status }]);
    } catch (error: any) {
      setHistory(prev => [...prev, { command: currentCmd, output: `Failed to execute: ${error.message}`, status: 'error' }]);
    } finally {
      setIsRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const clearHistory = () => setHistory([]);

  return (
    <div className="flex flex-col h-full bg-black border-t border-white/5 font-mono text-[11px] text-zinc-300 relative">
      <div className="flex items-center justify-between px-4 py-2 bg-[#111622] border-b border-white/5 select-none">
        <div className="flex items-center gap-2 font-black uppercase tracking-wider text-zinc-400">
          <Terminal size={12} className="text-primary" />
          <span>Terminal REPL</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={clearHistory} className="p-1.5 rounded-md hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors" title="Clear output">
            <RotateCcw size={12} />
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/5 text-zinc-500 hover:text-red-400 transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4 bg-black">
        {history.length === 0 && (
          <div className="text-zinc-600 italic select-none">REPL Session Started. Type a command below.</div>
        )}
        {history.map((item, idx) => (
          <div key={idx} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-cyan-400 font-bold">
              <span className="text-primary">$</span>
              <span>{item.command}</span>
            </div>
            <pre className={`whitespace-pre-wrap break-all ${item.status === 'error' ? 'text-red-400' : 'text-zinc-300'}`}>
              {item.output}
            </pre>
          </div>
        ))}
        {isRunning && (
          <div className="flex items-center gap-2 text-zinc-500 animate-pulse">
            <span className="text-primary">$</span>
            <span>Running...</span>
          </div>
        )}
        <div ref={endRef} />
      </div>
      
      <div className="px-4 py-3 bg-[#0B0E14] border-t border-white/5 flex items-center gap-2">
        <span className="text-primary font-bold select-none">$</span>
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={e => setCommand(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleRun()}
          disabled={isRunning}
          placeholder="Enter command (e.g. npm run test)"
          className="flex-1 bg-transparent border-none outline-none text-zinc-300 placeholder:text-zinc-700"
          autoComplete="off"
        />
      </div>
    </div>
  );
};
