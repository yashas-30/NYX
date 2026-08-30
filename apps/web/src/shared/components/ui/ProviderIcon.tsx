// ─── ProviderIcon ─────────────────────────────────────────────────────────────
// Single source of truth for provider → icon mapping.
// To add a new provider icon: add one line to the map below.

import { Cpu } from 'lucide-react';
import { Logo } from '@src/assets/icons/icons';
import { ModelProvider } from '@src/types';

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
    case 'gemini':
      return <Logo size={size + 4} className={className} />;
    case 'terminal':
      return <Cpu size={size} strokeWidth={1.5} className={className} />;
    case 'nyx-native':
      return (
        <Cpu size={size} strokeWidth={1.5} className={`${className} text-primary animate-pulse`} />
      );
    case 'openrouter':
      return <Cpu size={size} strokeWidth={1.5} className={`${className} text-violet-500`} />;
    case 'nvidia-nim':
    case 'nvidia':
      return <Cpu size={size} strokeWidth={1.5} className={`${className} text-emerald-400`} />;
    case 'groq':
      return <Cpu size={size} strokeWidth={1.5} className={`${className} text-orange-400`} />;
    case 'mistral':
      return <Cpu size={size} strokeWidth={1.5} className={`${className} text-amber-400`} />;
    default:
      return <Cpu size={size} strokeWidth={1.5} className={className} />;
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
  if (provider === 'all') return 'All Models';
  if (provider === 'nyx-native') return 'Local (Native)';
  if (provider === 'google') return 'Google';
  if (provider === 'meta') return 'Meta (Llama)';
  if (provider === 'microsoft') return 'Microsoft';
  if (provider === 'qwen') return 'Qwen (Alibaba)';
  if (provider === 'mistral') return 'Mistral';
  if (provider === 'cohere') return 'Cohere';
  if (provider === 'openchat') return 'OpenChat';
  if (provider === 'openrouter') return 'OpenRouter';
  if (provider === 'nvidia-nim' || provider === 'nvidia') return 'NVIDIA NIM';
  if (provider === 'groq') return 'Groq (LPU)';
  if (provider === 'community') return 'Community / Custom';
  return provider;
}

// ── Provider inference from model ID ──────────────────────────────────────────
// Detects provider from model ID string when it's not in the registry.
// Handles stale/renamed IDs gracefully — no code changes needed when renaming.
export function inferProviderFromId(modelId: string | undefined): string | undefined {
  if (!modelId) return undefined;

  const id = modelId.toLowerCase();

  // Fall back to prefix matching for cloud providers
  if (id.startsWith('gemini') || id.includes('gemini')) return 'gemini';
  if (id.startsWith('openrouter') || id.includes('openrouter')) return 'openrouter';
  if (
    id.startsWith('nvidia-nim') ||
    id.startsWith('nim') ||
    id.includes('integrate.api.nvidia.com')
  )
    return 'nvidia-nim';
  if (id.startsWith('groq') || id.includes('api.groq.com')) return 'groq';
  if (
    id.startsWith('mistral') ||
    id.startsWith('ministral') ||
    id.startsWith('codestral') ||
    id.includes('api.mistral.ai')
  )
    return 'mistral';

  return undefined;
}
