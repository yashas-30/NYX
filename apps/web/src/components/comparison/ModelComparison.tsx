import React, { useState } from 'react';
import { AIService } from '@src/core/services/ai.service';
import { Check, X, Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ComparisonConfig {
  prompt: string;
  models: Array<{ modelId: string; provider: string; apiKey?: string }>;
  systemInstruction?: string;
}

interface ComparisonResult {
  modelId: string;
  provider: string;
  response: string;
  metrics: { latency: number; tokens: number; tps: number };
  status: 'loading' | 'done' | 'error';
}

export function ModelComparisonInteractive({ selectedModels }: { selectedModels: Array<{ id: string; provider: string; name: string }> }) {
  const [prompt, setPrompt] = useState<string>('');
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runComparison = async () => {
    if (selectedModels.length === 0 || !prompt.trim()) return;

    setIsRunning(true);
    setResults(selectedModels.map(m => ({ 
      modelId: m.id, 
      provider: m.provider, 
      response: '', 
      metrics: { latency: 0, tokens: 0, tps: 0 }, 
      status: 'loading' 
    })));

    // Run all models in parallel
    const promises = selectedModels.map(async (model, index) => {
      try {
        const startTime = Date.now();
        const response = await AIService.execute(
          model.id,
          model.provider,
          prompt,
          undefined, // apiKey would be handled by AIService/vault internally if needed
        );
        const latency = Date.now() - startTime;

        setResults(prev => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            response: response.text,
            metrics: {
              latency,
              tokens: Math.ceil(response.text.length / 4), // Simple heuristic
              tps: Math.ceil(response.text.length / 4) / (latency / 1000)
            },
            status: 'done'
          };
          return next;
        });
      } catch (error) {
        setResults(prev => {
          const next = [...prev];
          next[index] = { ...next[index], status: 'error' };
          return next;
        });
      }
    });

    await Promise.all(promises);
    setIsRunning(false);
  };

  return (
    <div className="flex flex-col gap-6 mt-8 border-t border-white/10 pt-8">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold text-zinc-200">Interactive Prompt Comparison</h3>
        <p className="text-xs text-zinc-400">Run a prompt across the selected models above to compare outputs and latency.</p>
        
        <textarea
          className="w-full rounded-lg bg-black/20 border border-white/10 p-3 text-sm text-zinc-200 focus:outline-none focus:border-sky-500 transition-colors resize-y min-h-[100px]"
          placeholder="Enter a prompt to test across selected models..."
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
        />
        <div className="flex justify-end mt-2">
          <button 
            onClick={runComparison} 
            disabled={isRunning || !prompt.trim() || selectedModels.length === 0}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white font-medium rounded-md text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
          >
            {isRunning ? <><Loader2 className="w-3 h-3 animate-spin" /> Running...</> : 'Run Comparison'}
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div className={cn(
          'grid gap-6',
          results.length === 1 && 'grid-cols-1',
          results.length === 2 && 'grid-cols-2',
          results.length === 3 && 'grid-cols-3',
          results.length >= 4 && 'grid-cols-2'
        )}>
          {results.map((result, i) => (
            <div key={`${result.modelId}-${i}`} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-zinc-200">{result.modelId}</span>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{result.provider}</span>
                </div>
                {result.status === 'loading' && <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />}
                {result.status === 'done' && <Check className="w-4 h-4 text-emerald-500" />}
                {result.status === 'error' && <X className="w-4 h-4 text-red-500" />}
              </div>
              
              <div className="p-4 flex-1">
                {result.status === 'loading' ? (
                  <div className="animate-pulse space-y-3">
                    <div className="h-2 bg-white/10 rounded w-3/4" />
                    <div className="h-2 bg-white/10 rounded w-1/2" />
                    <div className="h-2 bg-white/10 rounded w-5/6" />
                  </div>
                ) : result.status === 'error' ? (
                  <p className="text-red-400 text-xs bg-red-500/10 p-3 rounded border border-red-500/20">Failed to generate response</p>
                ) : (
                  <div className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">{result.response}</div>
                )}
              </div>
              
              {result.status === 'done' && (
                <div className="px-4 py-2 border-t border-white/10 bg-black/20 flex gap-4 text-[10px] text-zinc-400 font-medium tracking-wider">
                  <span>{result.metrics.tokens} TOKENS</span>
                  <span>{(result.metrics.latency / 1000).toFixed(2)}S</span>
                  <span>{result.metrics.tps.toFixed(1)} T/S</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
