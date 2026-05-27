/**
 * @file src/features/coder/api/coderApi.ts
 * @description Encapsulated API/fetch calls for the coder feature.
 */

import { AIService } from '../services/ai.service';

export interface CriticPayload {
  prompt: string;
  response: string;
  apiKey: string;
  provider: string;
  modelId: string;
}

export const triggerCritic = async (payload: CriticPayload): Promise<void> => {
  await fetch('/api/nyx/critic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
};

export const fetchEvolutionaryRules = async (): Promise<string[]> => {
  const res = await fetch('/api/nyx/rules');
  if (!res.ok) throw new Error(`Failed to fetch rules: ${res.statusText}`);
  const data = await res.json();
  if (data.success && Array.isArray(data.rules)) {
    return data.rules.map((r: any) => r.rule);
  }
  return [];
};

export const searchCodebase = async (query: string, signal?: AbortSignal): Promise<any> => {
  const res = await fetch('/api/nyx/codebase-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal
  });
  if (!res.ok) throw new Error(`Codebase search failed: ${res.statusText}`);
  return res.json();
};

export const searchWeb = async (query: string, signal?: AbortSignal): Promise<any> => {
  const res = await fetch('/api/nyx/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal
  });
  if (!res.ok) throw new Error(`Web search failed: ${res.statusText}`);
  return res.json();
};

export const validateWorkspace = async (): Promise<any> => {
  const res = await AIService.fetchWithAuth('/api/nyx/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!res.ok) throw new Error(`Validation request failed: ${res.status}`);
  return res.json();
};
