// ─── ProviderIcon ─────────────────────────────────────────────────────────────
// Single source of truth for provider → icon mapping.
// To add a new provider icon: add one line to the map below.

import { Cpu, Zap, Bot, Sparkles } from 'lucide-react';
import { Logo } from '@src/lib/design-system/icons';
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
    case 'nvidia':    return <Cpu size={size} strokeWidth={1.5} className={className} />;
    case 'openai':
    case 'claude':
    case 'deepseek':  return <Bot size={size} strokeWidth={1.5} className={className} />;
    case 'opencode':  return <Sparkles size={size} strokeWidth={1.5} className={className} />;
    case 'pollinations': return <Sparkles size={size} strokeWidth={1.5} className={`${className} text-amber-500 animate-pulse`} />;
    case 'terminal':  return <Bot size={size} strokeWidth={1.5} className={className} />;
    case 'nyx-native': return <Cpu size={size} strokeWidth={1.5} className={`${className} text-[#22D3EE] animate-pulse`} />;
    case 'qwen-local': return <Sparkles size={size} strokeWidth={1.5} className={`${className} text-amber-400 animate-pulse`} />;
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
// Matches PROVIDER_LABELS in provider.ts for unified naming.
export function getProviderLabel(provider: string | undefined): string {
  if (!provider) return 'node';
  if (provider === 'opencode') return 'Open Code';
  if (provider === 'pollinations') return 'Pollinations (Free)';
  if (provider === 'nyx-native') return 'NYX Native';
  if (provider === 'qwen-local') return 'Qwen Local (Python)';
  if (provider === 'google') return 'Google';
  if (provider === 'meta') return 'Meta (Llama)';
  if (provider === 'microsoft') return 'Microsoft';
  if (provider === 'qwen') return 'Qwen (Alibaba)';
  if (provider === 'deepseek') return 'DeepSeek';
  if (provider === 'mistral') return 'Mistral';
  if (provider === 'cohere') return 'Cohere';
  if (provider === 'nvidia') return 'NVIDIA';
  if (provider === 'openchat') return 'OpenChat';
  if (provider === 'community') return 'Community / Custom';
  return provider;
}

// ── Provider inference from model ID ──────────────────────────────────────────
// Detects provider from model ID string when it's not in the registry.
// Handles stale/renamed IDs gracefully — no code changes needed when renaming.
export function inferProviderFromId(modelId: string | undefined): string | undefined {
  if (!modelId) return undefined;

  const id = modelId.toLowerCase();
  if (id.startsWith('opencode/') || id.startsWith('opencode-')) return 'opencode';
  if (id.startsWith('pollinations/') || id.startsWith('pollinations-')) return 'pollinations';
  
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
