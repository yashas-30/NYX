import { INluAdapter, NluParseResult } from './nlu.interface.js';
import { LocalAdapter } from './local.adapter.js';
import logger from '../../../lib/logger.js';
import { env } from '../../../config/env.js';

export class RasaAdapter implements INluAdapter {
  private localFallback = new LocalAdapter();

  async parse(text: string, sessionId: string): Promise<NluParseResult> {
    const rasaUrl = env.RASA_URL || 'http://localhost:5005';

    try {
      const response = await fetch(`${rasaUrl}/model/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Rasa API responded with status: ${response.status}`);
      }

      const data = (await response.json()) as any;

      const intent = data?.intent?.name || 'input.unknown';
      const confidence = data?.intent?.confidence || 0.0;

      const entities: Record<string, any> = {};
      if (Array.isArray(data?.entities)) {
        for (const entity of data.entities) {
          if (entity.entity && entity.value !== undefined) {
            entities[entity.entity] = entity.value;
          }
        }
      }

      return {
        intent,
        confidence,
        entities,
        fulfillmentText: `Rasa parsed intent: ${intent} with confidence ${confidence.toFixed(2)}`,
      };
    } catch (err: any) {
      logger.info(
        `Rasa NLU engine is offline at ${rasaUrl} (${err.message}). Running Rasa in MOCK mode (falling back to local NLU).`
      );
      const result = await this.localFallback.parse(text, sessionId);
      return {
        ...result,
        fulfillmentText: `[Rasa Mock] ${result.fulfillmentText || ''}`,
      };
    }
  }
}
