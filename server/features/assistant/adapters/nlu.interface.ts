export interface NluParseResult {
  intent: string;
  confidence: number;
  entities: Record<string, any>;
  fulfillmentText?: string;
}

export interface INluAdapter {
  parse(text: string, sessionId: string): Promise<NluParseResult>;
}
