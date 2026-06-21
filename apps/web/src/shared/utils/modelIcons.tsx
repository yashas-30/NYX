import { AnimatedIcon } from '@shared/components/ui/animated-icon';
/**
 * @file src/features/coder/utils/modelIcons.ts
 * @description Provider-specific icon rendering for model selectors.
 */

import React from 'react';
import { Bot, BrainCircuit } from 'lucide-react';
import { ModelDefinition } from '@src/infrastructure/types';

export function getCustomModelIcon(model: ModelDefinition | null | undefined): React.ReactNode {
  if (!model) return <AnimatedIcon icon={Bot} className="w-3.5 h-3.5 text-muted-foreground/70" />;
  const provider = model.provider?.toLowerCase() || '';
  const id = model.id?.toLowerCase() || '';

  if (id.includes('gemini') || provider.includes('google') || provider.includes('gemini')) {
    return (
      <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.2 7.2 2.4-7.2 2.4-2.4 7.2-2.4-7.2-7.2-2.4 7.2-2.4z" />
      </svg>
    );
  }

  return <AnimatedIcon icon={BrainCircuit} className="w-3.5 h-3.5 text-purple-500" />;
}
