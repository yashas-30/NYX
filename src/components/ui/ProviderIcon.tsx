// ─── ProviderIcon ─────────────────────────────────────────────────────────────
// Single source of truth for provider → icon mapping.
// To add a new provider icon: add one line to the map below.

import { Cpu, Zap, Bot, Terminal, Sparkles, HardDrive } from 'lucide-react';
import { Logo } from '../../lib/design-system/icons';
import { ModelProvider } from '../../types';

interface ProviderIconProps {
  provider: ModelProvider | string | undefined;
  size?: number;
  className?: string;
}

// ── Provider → icon map ────────────────────────────────────────────────────────
// Add new providers here only. No other file needs changing.
const PROVIDER_ICON_MAP: Record<string, React.ReactNode> = {};

function getIcon(provider: string | undefined, size: number, className: string): React.ReactNode {
  if (!provider) return <Cpu size={size} strokeWidth={1.5} className={className} />;
  switch (provider) {
    case 'gemini':    return <Logo size={size + 4} className={className} />;
    case 'openrouter': return <Zap size={size} strokeWidth={1.5} className={className} />;
    case 'ollama':    return <Terminal size={size} strokeWidth={1.5} className={className} />;
    case 'nvidia':    return <Cpu size={size} strokeWidth={1.5} className={className} />;
    case 'lmstudio':  return <HardDrive size={size} strokeWidth={1.5} className={className} />;
    case 'openai':
    case 'claude':
    case 'deepseek':  return <Bot size={size} strokeWidth={1.5} className={className} />;
    case 'opencode':  return <Sparkles size={size} strokeWidth={1.5} className={className} />;
    case 'terminal':  return <Bot size={size} strokeWidth={1.5} className={className} />;
    default:          return <Cpu size={size} strokeWidth={1.5} className={className} />;
  }
}

export const ProviderIcon: React.FC<ProviderIconProps> = ({
  provider,
  size = 18,
  className = 'text-muted-foreground',
}) => {
  return <>{getIcon(provider, size, className)}</>;
};

// ── Provider display name ──────────────────────────────────────────────────────
// Converts provider ID to a human-readable label shown in the card header.
export function getProviderLabel(provider: string | undefined): string {
  if (!provider) return 'node';
  if (provider === 'lmstudio') return 'LM Studio';
  if (provider === 'opencode') return 'Open Code';
  return provider;
}

// ── Provider inference from model ID ──────────────────────────────────────────
// Detects provider from model ID string when it's not in the registry.
// Handles stale/renamed IDs gracefully — no code changes needed when renaming.
export function inferProviderFromId(
  modelId: string | undefined,
  ollamaModelNames: Set<string> | string[] = [],
  lmStudioModelNames: Set<string> | string[] = []
): ModelProvider | undefined {
  if (!modelId) return undefined;
  
  // Check explicitly loaded local nodes first (handles both Set and array)
  const ollamaSet = ollamaModelNames instanceof Set ? ollamaModelNames : new Set(ollamaModelNames);
  const lmStudioSet = lmStudioModelNames instanceof Set ? lmStudioModelNames : new Set(lmStudioModelNames);
  
  if (ollamaSet.has(modelId)) return 'ollama';
  if (lmStudioSet.has(modelId)) return 'lmstudio';

  const id = modelId.toLowerCase();
  if (id.startsWith('opencode/') || id.startsWith('opencode-')) return 'opencode';
  
  // Fall back to prefix matching for cloud providers
  if (id.startsWith('gemini') || id.includes('gemini')) return 'gemini';
  if (id.startsWith('moonshotai/') || id.includes('nvidia')) return 'nvidia';
  if (
    id.startsWith('openai/') || id.startsWith('anthropic/') ||
    id.startsWith('meta-llama/') || id.startsWith('mistralai/') ||
    id.startsWith('deepseek/') || id.startsWith('google/') ||
    id.startsWith('qwen/') || id.startsWith('microsoft/') ||
    id.startsWith('openrouter/')
  ) return 'openrouter';

  return undefined;
}
