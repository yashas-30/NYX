import React, { useState } from 'react';
import {
  CheckIcon as Check,
  TerminalIcon as Terminal,
  ChevronDownIcon as ChevronDown,
} from '@animateicons/react/lucide';
import { CopyIcon as Copy } from '@animateicons/react/lucide';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';

interface ErrorRendererProps {
  content: string;
  onRetry?: () => void;
}

/**
 * Renders the styled error card for assistant messages with status === 'error'.
 * Extracted from the IIFE at ~L1241 in ChatMessageList. Handles both high-demand
 * (429/rate-limit) and generic execution errors with distinct visual treatment.
 */
export const ErrorRenderer: React.FC<ErrorRendererProps> = ({ content, onRetry }) => {
  const [showLogs, setShowLogs] = useState(false);
  const [copied, setCopied] = useState(false);

  const isHighDemand = !!(
    content &&
    (content.includes('[UNAVAILABLE]') ||
      content.toLowerCase().includes('high demand') ||
      // Match "Request failed (429)" — status code in parens, not incidentally in body text
      /Request failed \(429\)/i.test(content) ||
      content.includes('RESOURCE_EXHAUSTED'))
  );

  const isModelNotFound = !!(
    content &&
    (/Request failed \(40[04]\)/i.test(content) ||
      content.toLowerCase().includes('not found') ||
      content.toLowerCase().includes('does not exist'))
  );

  const cleanErrorMessage = content.startsWith('Error: Error:') ? content.substring(7) : content;
  const errorMessage =
    cleanErrorMessage ||
    'Error: Generation failed. Please check your model settings or connection.';

  const copyDiagnostics = () => {
    navigator.clipboard.writeText(errorMessage);
    setCopied(true);
    toast.success('Diagnostics copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const bgClass = isHighDemand
    ? 'border-orange-500/20 bg-orange-500/[0.03] shadow-orange-950/5 text-orange-200'
    : isModelNotFound
      ? 'border-amber-500/20 bg-amber-500/[0.03] shadow-amber-950/5 text-amber-200'
      : 'border-red-500/20 bg-red-500/[0.03] shadow-red-950/5 text-red-200';

  const badgeClass = isHighDemand
    ? 'bg-orange-500/10 text-orange-300 border-orange-500/20'
    : isModelNotFound
      ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
      : 'bg-red-500/10 text-red-300 border-red-500/20';

  const iconClass = isHighDemand
    ? 'text-orange-400 animate-pulse'
    : isModelNotFound
      ? 'text-amber-400'
      : 'text-red-400';

  const title = isHighDemand
    ? 'Rate Limit Reached'
    : isModelNotFound
      ? 'Model Not Available'
      : 'Execution Engine Alert';

  const description = isHighDemand
    ? 'You have hit the free-tier rate limit for this model (429 RESOURCE_EXHAUSTED). Wait a minute and retry, or select a model with a higher RPM limit.'
    : isModelNotFound
      ? 'The selected model ID was not found on the API. It may have been deprecated or renamed. Open the model selector and choose a different model.'
      : 'An unexpected error occurred during execution. Check your API key and network connection, then retry.';

  return (
    <div
      className={`my-3 rounded-xl border p-4 shadow-sm backdrop-blur-md transition-all duration-300 ${bgClass}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-lg bg-background/50 border border-border/10 shrink-0 ${iconClass}`}
        >
          <AlertTriangle className="w-4 h-4 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="font-semibold text-[13px] tracking-tight">{title}</h4>
            <span
              className={`text-[9px] font-mono tracking-wider uppercase px-2 py-0.5 rounded border ${badgeClass}`}
            >
              {isHighDemand ? '429 Limit' : isModelNotFound ? '404 Not Found' : 'Inference Error'}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap break-words max-w-full font-sans">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border/10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-foreground/10 hover:bg-foreground/15 text-foreground transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
              <span>Retry Request</span>
            </button>
          )}
          <span className="text-[10px] text-muted-foreground/60 select-none">
            Or select another model in the menu to retry
          </span>
        </div>

        <button
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
        >
          <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
          <span>{showLogs ? 'Hide Diagnostics' : 'Inspect Diagnostics'}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${showLogs ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {showLogs && (
        <div className="mt-3 pt-3 border-t border-border/10">
          <div className="flex items-center justify-between gap-2 mb-1.5 select-none">
            <span className="text-[10px] font-mono text-muted-foreground/50">Raw Engine Trace</span>
            <button
              onClick={copyDiagnostics}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              <span>{copied ? 'Copied' : 'Copy Log'}</span>
            </button>
          </div>
          <pre className="p-3 rounded-lg bg-zinc-950/80 text-[11px] font-mono text-zinc-300 overflow-x-auto border border-border/20 max-h-48 leading-relaxed scrollbar-thin">
            {errorMessage}
          </pre>
        </div>
      )}
    </div>
  );
};
ErrorRenderer.displayName = 'ErrorRenderer';
