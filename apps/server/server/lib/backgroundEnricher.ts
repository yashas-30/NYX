/**
 * @file server/lib/backgroundEnricher.ts
 * @description Off-critical-path enrichment pipeline.
 *
 * Runs prompt preprocessing (Antigravity, workerPool sanitization) asynchronously
 * so the current response streams immediately. Results are stored per conversationId
 * and injected into the NEXT turn's system context.
 *
 * This eliminates the 200–1000ms TTFT penalty caused by synchronous preprocessing.
 */

import logger from './logger.js';
import { workerPool } from './workers/workerPool.js';
import { env } from '../config/env.js';
import { Gateway } from './gateway.js';
import { TTLCache } from './cache.js';
import { GoogleGenAI } from '@google/genai';

const OPTIMIZATION_TEMPLATES: Record<string, { version: string, instruction: string }[]> = {
  coding: [
    {
      version: 'v1-strict',
      instruction: 'You are an expert prompt engineer specializing in coding tasks. Rewrite the user\'s prompt to be explicit, modular, and optimized for an AI coding agent. Include requirements for robust error handling, type safety, and clean architecture. Return ONLY the rewritten prompt without conversational filler.'
    },
    {
      version: 'v2-creative',
      instruction: 'You are an AI prompt optimizer for software engineering. Expand the user\'s coding prompt by adding best practices, suggesting design patterns, and structuring it into clear steps. Return ONLY the rewritten prompt.'
    }
  ],
  creative: [
    {
      version: 'v1-storyteller',
      instruction: 'You are a prompt optimizer for creative writing. Enhance the user\'s prompt by adding vivid details, character motivations, and sensory language. Return ONLY the rewritten prompt.'
    }
  ],
  general: [
    {
      version: 'v1-clarity',
      instruction: 'You are a prompt optimizer. Rewrite the user\'s prompt to maximize clarity, logical structure, and detail. Ensure the intent is unambiguous. Return ONLY the rewritten prompt.'
    },
    {
      version: 'v2-structured',
      instruction: 'You are a prompt structurer. Convert the user\'s prompt into a bulleted list of precise instructions and constraints. Return ONLY the rewritten prompt.'
    }
  ]
};

export interface EnrichmentResult {
  sanitizedPrompt: string;
  domain: string;
  processedAt: number;
}

// Store enrichment results per conversationId, 10-minute TTL
const enrichmentStore = new TTLCache<EnrichmentResult>(10 * 60 * 1000, 500);

/**
 * Enrich a prompt in the background. Non-blocking — fire and forget.
 * Results are stored and can be retrieved via getEnrichment() on the next turn.
 */
export function enqueueEnrichment(
  conversationId: string,
  prompt: string,
  provider: string,
  model: string,
  apiKey?: string
): void {
  // Fire and forget — do not await
  runEnrichment(conversationId, prompt, provider, model, apiKey).catch((err) =>
    logger.warn({ err }, '[BackgroundEnricher] Enrichment failed (non-fatal)')
  );
}

/**
 * Retrieve the enrichment result from the previous turn, if available.
 * Returns null if not yet computed or expired.
 */
export function getEnrichment(conversationId: string): EnrichmentResult | null {
  return enrichmentStore.get(conversationId) ?? null;
}

/**
 * Clear enrichment for a conversation (e.g., on conversation reset).
 */
export function clearEnrichment(conversationId: string): void {
  enrichmentStore.delete(conversationId);
}

async function runEnrichment(
  conversationId: string,
  prompt: string,
  provider: string,
  model: string,
  apiKey?: string
): Promise<void> {
  let sanitizedPrompt = prompt;
  let domain = 'general';

  // Step 1: Sanitize prompt via worker pool (CPU-bound, off main thread)
  try {
    sanitizedPrompt = await workerPool.preprocessPrompt(prompt);
  } catch (err: any) {
    logger.warn('[BackgroundEnricher] Worker sanitization failed:', err.message);
  }

  // Step 2: Detect domain
  if (/```|function|class|const |let |import /.test(prompt)) {
    domain = 'coding';
  } else if (/story|creative|write|poem|fiction/i.test(prompt)) {
    domain = 'creative';
  }

  // Step 3: Run Antigravity Preprocessing via Gemini API
  const key = apiKey || env.GEMINI_API_KEY;
  if (key) {
    try {
      const templates = OPTIMIZATION_TEMPLATES[domain] || OPTIMIZATION_TEMPLATES['general'];
      const template = templates[Math.floor(Math.random() * templates.length)];
      const instruction = `${template.instruction}\n\nUser Prompt: ${sanitizedPrompt}`;
      
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
          model: 'gemini-1.5-flash',
          contents: instruction,
      });

      if (response.text) {
        sanitizedPrompt = response.text.trim();
        logger.debug({ version: template.version, domain }, '[BackgroundEnricher] Antigravity prompt optimized');
      }
    } catch (err: any) {
      logger.warn('[BackgroundEnricher] Antigravity optimization failed (fallback to sanitized prompt):', err.message);
    }
  }

  enrichmentStore.set(conversationId, {
    sanitizedPrompt,
    domain,
    processedAt: Date.now(),
  });

  logger.debug({ conversationId, domain }, '[BackgroundEnricher] Enrichment stored for next turn');
}
