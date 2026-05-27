/**
 * @file src/features/coder/hooks/useMessageHistory.ts
 * @description Manages chat telemetry metrics and suggested prompts.
 */

import { useState, useCallback } from 'react';
import { ChatMessage, TelemetryMetrics } from '@src/infrastructure/types';

export const useMessageHistory = () => {
  const [metrics, setMetrics] = useState<TelemetryMetrics>({ latency: 0, tokens: 0, tps: 0 });
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);

  const updateMetrics = useCallback((newMetrics: TelemetryMetrics) => {
    setMetrics(newMetrics);
  }, []);

  const clearMetrics = useCallback(() => {
    setMetrics({ latency: 0, tokens: 0, tps: 0 });
    setSuggestedPrompts([]);
  }, []);

  const getSuggestions = useCallback((history: ChatMessage[]) => {
    // If the chat is empty, show zero suggested prompts above the input box (only showing landing page chips)
    if (!history || history.length === 0) {
      setSuggestedPrompts([]);
      return;
    }

    const lastMsg = history[history.length - 1];
    // We only generate suggestions after the assistant responds
    if (!lastMsg || lastMsg.role === 'user') {
      return;
    }

    const content = lastMsg.content.toLowerCase();
    
    // Default fallback general recommendations
    let suggestions = ['Explain this logic step-by-step', 'Add robust error handling', 'Provide unit tests for this'];

    // 1. Arduino / Raspberry Pi / Hardware
    if (
      content.includes('arduino') ||
      content.includes('raspberry') ||
      content.includes('sensor') ||
      content.includes('led') ||
      content.includes('blink') ||
      content.includes('pin') ||
      content.includes('gpio') ||
      content.includes('spi') ||
      content.includes('i2c') ||
      content.includes('wire') ||
      content.includes('hardware')
    ) {
      suggestions = [
        'Add debounce logic for buttons',
        'Show standard circuit wiring details',
        'Configure deep sleep low-power mode'
      ];
    }
    // 2. React / Frontend Components
    else if (
      content.includes('react') ||
      content.includes('component') ||
      content.includes('hook') ||
      content.includes('state') ||
      content.includes('prop') ||
      content.includes('vite') ||
      content.includes('next.js') ||
      content.includes('rendering')
    ) {
      suggestions = [
        'Add custom loading skeleton state',
        'Refactor to clean custom React Hook',
        'Optimize re-renders & memoization'
      ];
    }
    // 3. Database / SQL
    else if (
      content.includes('sql') ||
      content.includes('database') ||
      content.includes('query') ||
      content.includes('postgres') ||
      content.includes('table') ||
      content.includes('index') ||
      content.includes('schema')
    ) {
      suggestions = [
        'Create database migration script',
        'Optimize indexes for fast queries',
        'Wrap operations in a secure transaction'
      ];
    }
    // 4. CSS / Styling / Premium design
    else if (
      content.includes('css') ||
      content.includes('style') ||
      content.includes('tailwind') ||
      content.includes('glassmorphic') ||
      content.includes('responsive') ||
      content.includes('layout') ||
      content.includes('theme')
    ) {
      suggestions = [
        'Make this layout fully responsive',
        'Add elegant glassmorphic effects',
        'Audit accessibility (WCAG AA compliance)'
      ];
    }
    // 5. General Error / Debugging
    else if (
      content.includes('error') ||
      content.includes('fail') ||
      content.includes('bug') ||
      content.includes('crash') ||
      content.includes('exception') ||
      content.includes('null') ||
      content.includes('undefined')
    ) {
      suggestions = [
        'Explain the exact root cause',
        'Add fallback error boundary recovery',
        'Write edge-case tests to prevent this'
      ];
    }

    setSuggestedPrompts(suggestions);
  }, []);

  return {
    metrics,
    suggestedPrompts,
    setSuggestedPrompts,
    updateMetrics,
    clearMetrics,
    getSuggestions
  };
};
