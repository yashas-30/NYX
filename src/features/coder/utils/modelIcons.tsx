/**
 * @file src/features/coder/utils/modelIcons.ts
 * @description Provider-specific icon rendering for model selectors.
 */

import React from 'react';
import { Bot, BrainCircuit } from 'lucide-react';
import { ModelDefinition } from '@src/infrastructure/types';

export function getCustomModelIcon(model: ModelDefinition | null | undefined): React.ReactNode {
  if (!model) return <Bot className="w-3.5 h-3.5 text-muted-foreground/70" />;
  const provider = model.provider?.toLowerCase() || '';
  const id = model.id?.toLowerCase() || '';

  if (id.includes('claude') || provider.includes('anthropic')) {
    return (
      <svg className="w-3.5 h-3.5 text-[#F15A24]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.8 15.5h-3.6l-.9 2.5H7.2L11 6.1h2l3.8 11.9h-2.1l-.9-2.5zm-.4-1.2l-1.4-3.9-1.4 3.9h2.8z" />
      </svg>
    );
  }
  if (id.includes('gpt') || provider.includes('openai')) {
    return (
      <svg className="w-3.5 h-3.5 text-[#10a37f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }
  if (id.includes('gemini') || provider.includes('google') || provider.includes('gemini')) {
    return (
      <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2 7.2 2.4-7.2 2.4-2.4 7.2-2.4-7.2-7.2-2.4 7.2-2.4z" />
      </svg>
    );
  }
  
  return <BrainCircuit className="w-3.5 h-3.5 text-purple-500" />;
}
