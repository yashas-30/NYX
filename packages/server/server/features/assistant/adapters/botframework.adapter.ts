import { INluAdapter, NluParseResult } from './nlu.interface.js';
import { LocalAdapter } from './local.adapter.js';
import logger from '../../../lib/logger.js';

export class BotFrameworkAdapter implements INluAdapter {
  private localFallback = new LocalAdapter();

  async parse(text: string, sessionId: string): Promise<NluParseResult> {
    try {
      let activity: any = null;
      if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
        try {
          activity = JSON.parse(text);
        } catch {
          // ignore, parse as raw text
        }
      }

      if (!activity) {
        const result = await this.localFallback.parse(text, sessionId);
        return {
          ...result,
          fulfillmentText: `[BotFramework Mock] ${result.fulfillmentText || ''}`,
        };
      }

      const utterance = activity.text || '';
      logger.info(
        { activityId: activity.id, channelId: activity.channelId },
        'Parsing Bot Framework Activity payload.'
      );

      let intent = 'input.unknown';
      let confidence = 0.5;
      const entities: Record<string, any> = {};

      if (Array.isArray(activity.entities)) {
        for (const item of activity.entities) {
          if (item.type === 'intent' && item.name) {
            intent = item.name;
            confidence = typeof item.confidence === 'number' ? item.confidence : 0.9;
          }
          if (item.type === 'entity' && item.entity && item.value !== undefined) {
            entities[item.entity] = item.value;
          }
        }
      }

      if (intent === 'input.unknown' && utterance) {
        const localResult = await this.localFallback.parse(utterance, sessionId);
        intent = localResult.intent;
        confidence = localResult.confidence;
        Object.assign(entities, localResult.entities);
      }

      return {
        intent,
        confidence,
        entities,
        fulfillmentText: `[BotFramework Activity] Processed intent: ${intent} with confidence ${confidence.toFixed(2)}`,
      };
    } catch (err: any) {
      logger.error(
        { err: err.message },
        'Failed to parse Bot Framework Activity. Falling back to local NLU.'
      );
      const result = await this.localFallback.parse(text, sessionId);
      return {
        ...result,
        fulfillmentText: `[BotFramework Fallback] ${result.fulfillmentText || ''}`,
      };
    }
  }
}
