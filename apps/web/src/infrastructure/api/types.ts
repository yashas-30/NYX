/**
 * @file src/infrastructure/api/types.ts
 * @description Shared API types to avoid circular imports between inferenceClient and directClient.
 */

export interface AISettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  responseFormat?: 'text' | 'json' | { type: 'json_schema'; schema: object };
}
