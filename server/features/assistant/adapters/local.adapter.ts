import { INluAdapter, NluParseResult } from './nlu.interface.ts';

export class LocalAdapter implements INluAdapter {
  async parse(text: string, _sessionId: string): Promise<NluParseResult> {
    const query = text.toLowerCase().trim();

    let intent = 'input.unknown';
    let confidence = 0.5;
    let entities: Record<string, any> = {};
    let fulfillmentText =
      "I'm not sure how to help with that. Try asking about system health, cache statistics, or listing models.";

    // 1. Workspace change
    const workspaceChangeRegex = /(?:change|set|switch)\s+workspace\s+(?:to\s+)?([^\r\n]+)/i;
    const wsMatch = text.match(workspaceChangeRegex);
    if (wsMatch) {
      intent = 'workspace.change';
      confidence = 0.95;
      entities = { path: wsMatch[1].trim() };
      fulfillmentText = `Changing workspace root to ${wsMatch[1].trim()}...`;
      return { intent, confidence, entities, fulfillmentText };
    }

    // 2. Model switch / run / start
    // "switch active model to <modelId>", "switch model to <modelId>", "run model <modelId>", "start model <modelId>", "use model <modelId>"
    const switchRegex =
      /(?:switch|change|set|run|start|use)(?:\s+active)?(?:\s+model)?(?:\s+to)?\s+([\w\.\-]+)/i;
    const switchMatch = text.match(switchRegex);
    if (
      switchMatch &&
      !query.includes('list') &&
      !query.includes('show') &&
      !query.includes('status')
    ) {
      intent = 'model.switch';
      confidence = 0.95;
      entities = { modelId: switchMatch[1].trim() };
      fulfillmentText = `Switching active model to ${switchMatch[1].trim()}...`;
      return { intent, confidence, entities, fulfillmentText };
    }

    // 3. Model list / show
    if (
      query.includes('list model') ||
      query.includes('show model') ||
      query.includes('available model') ||
      query.includes('what models')
    ) {
      intent = 'model.list';
      confidence = 0.9;
      fulfillmentText = 'Listing all available local models...';
      return { intent, confidence, entities, fulfillmentText };
    }

    // 4. Model status / active model
    if (
      query.includes('active model') ||
      query.includes('current model') ||
      (query.includes('model') && query.includes('status')) ||
      query.includes('running model')
    ) {
      intent = 'model.status';
      confidence = 0.9;
      fulfillmentText = 'Checking active model status...';
      return { intent, confidence, entities, fulfillmentText };
    }

    // 5. Cache clear / purge
    if (
      query.includes('clear cache') ||
      query.includes('empty cache') ||
      query.includes('purge cache') ||
      query.includes('delete cache')
    ) {
      intent = 'cache.clear';
      confidence = 0.95;
      fulfillmentText = 'Clearing the cache...';
      return { intent, confidence, entities, fulfillmentText };
    }

    // 6. Cache stats / hit rate
    if (
      query.includes('cache stats') ||
      query.includes('cache status') ||
      query.includes('cache statistics') ||
      query.includes('hit rate') ||
      query.includes('cache hit')
    ) {
      intent = 'cache.stats';
      confidence = 0.9;
      fulfillmentText = 'Retrieving cache statistics...';
      return { intent, confidence, entities, fulfillmentText };
    }

    // 7. System health / checks
    if (
      query.includes('system health') ||
      query.includes('health status') ||
      query.includes('health check') ||
      query.includes('system status') ||
      query.includes('is system ok')
    ) {
      intent = 'system.health';
      confidence = 0.9;
      fulfillmentText = 'Retrieving system health status...';
      return { intent, confidence, entities, fulfillmentText };
    }

    // 8. System metrics / CPU / RAM / memory usage
    if (
      query.includes('system metrics') ||
      query.includes('cpu usage') ||
      query.includes('memory usage') ||
      query.includes('ram usage') ||
      query.includes('vram') ||
      query.includes('uptime')
    ) {
      intent = 'system.metrics';
      confidence = 0.9;
      fulfillmentText = 'Retrieving system metrics...';
      return { intent, confidence, entities, fulfillmentText };
    }

    // 9. Workspace info
    if (
      query.includes('workspace info') ||
      query.includes('current workspace') ||
      query.includes('workspace path') ||
      query.includes('get workspace')
    ) {
      intent = 'workspace.info';
      confidence = 0.9;
      fulfillmentText = 'Retrieving current workspace info...';
      return { intent, confidence, entities, fulfillmentText };
    }

    return { intent, confidence, entities, fulfillmentText };
  }
}
