import { useState, useRef, useEffect } from 'react';
import { executeCommand } from '@src/infrastructure/api/coderApi';

export function Terminal() {
  const [history, setHistory] = useState<Array<{ command: string; output: string; error?: string }>>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [history]);

  const runCommand = async () => {
    if (!input.trim() || isRunning) return;
    setIsRunning(true);

    try {
      const result = await executeCommand(input.trim());
      setHistory(prev => [...prev, { command: input, output: result.stdout, error: result.stderr }]);
    } catch (error: any) {
      setHistory(prev => [...prev, { command: input, output: '', error: error.message }]);
    } finally {
      setInput('');
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface">
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 font-mono text-sm">
        {history.map((h, i) => (
          <div key={i} className="mb-2">
            <div className="text-primary-500">$ {h.command}</div>
            <div className="text-text whitespace-pre-wrap">{h.output}</div>
            {h.error && <div className="text-error">{h.error}</div>}
          </div>
        ))}
      </div>
      <div className="flex items-center p-2 border-t border-border">
        <span className="text-primary-500 mr-2">$</span>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runCommand()}
          className="flex-1 bg-transparent outline-none text-sm"
          placeholder="Type command..."
          disabled={isRunning}
        />
      </div>
    </div>
  );
}
