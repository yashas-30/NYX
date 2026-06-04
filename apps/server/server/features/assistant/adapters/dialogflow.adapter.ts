import { INluAdapter, NluParseResult } from './nlu.interface.js';
import { LocalAdapter } from './local.adapter.js';
import logger from '../../../lib/logger.js';
import { env } from '../../../config/env.js';

export class DialogflowAdapter implements INluAdapter {
  private localFallback = new LocalAdapter();

  async parse(text: string, sessionId: string): Promise<NluParseResult> {
    const projectId = env.DIALOGFLOW_PROJECT_ID;

    if (!projectId) {
      logger.info(
        'Dialogflow credentials not configured. Running Dialogflow in MOCK mode (falling back to local NLU).'
      );
      const result = await this.localFallback.parse(text, sessionId);
      return {
        ...result,
        fulfillmentText: `[Dialogflow Mock] ${result.fulfillmentText || ''}`,
      };
    }

    try {
      const accessToken = env.DIALOGFLOW_ACCESS_TOKEN;
      if (!accessToken) {
        throw new Error('DIALOGFLOW_ACCESS_TOKEN env var is missing');
      }

      const url = `https://dialogflow.googleapis.com/v2/projects/${projectId}/agent/sessions/${sessionId}:detectIntent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queryInput: {
            text: {
              text,
              languageCode: 'en-US',
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Dialogflow API error: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      const queryResult = data.queryResult;

      const intent = queryResult?.intent?.displayName || 'input.unknown';
      const confidence = queryResult?.intentDetectionConfidence || 0.0;

      const entities: Record<string, any> = {};
      if (queryResult?.parameters) {
        for (const [key, val] of Object.entries(queryResult.parameters)) {
          if (val !== undefined && val !== null && val !== '') {
            entities[key] = val;
          }
        }
      }

      const fulfillmentText =
        queryResult?.fulfillmentText || 'Dialogflow query parsed successfully.';

      return {
        intent,
        confidence,
        entities,
        fulfillmentText,
      };
    } catch (err: any) {
      logger.error(
        { err: err.message },
        'Dialogflow detectIntent failed. Falling back to local NLU.'
      );
      const result = await this.localFallback.parse(text, sessionId);
      return {
        ...result,
        fulfillmentText: `[Dialogflow Fallback] ${result.fulfillmentText || ''}`,
      };
    }
  }
}
