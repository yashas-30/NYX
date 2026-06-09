import logger from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { INluAdapter, NluParseResult } from './adapters/nlu.interface.js';
import { LocalAdapter } from './adapters/local.adapter.js';
import { DialogflowAdapter } from './adapters/dialogflow.adapter.js';
import { RasaAdapter } from './adapters/rasa.adapter.js';
import { BotFrameworkAdapter } from './adapters/botframework.adapter.js';

import { SystemService } from '../system/system.service.js';
import { LocalModelsService } from '../local-models/localModels.service.js';
import { CacheService } from '../cache/cache.service.js';
import { WorkspaceService } from '../workspace/workspace.service.js';

export type NluEngineType = 'local' | 'dialogflow' | 'rasa' | 'botframework';

export interface PendingAction {
  action: string;
  entities: Record<string, any>;
  confirmationMessage: string;
}

export class AssistantService {
  private static activeEngine: NluEngineType = 'local';

  // In-memory pending actions map keyed by sessionId
  private static pendingActions = new Map<string, PendingAction>();

  private localAdapter = new LocalAdapter();
  private dialogflowAdapter = new DialogflowAdapter();
  private rasaAdapter = new RasaAdapter();
  private botFrameworkAdapter = new BotFrameworkAdapter();

  private systemService = new SystemService();
  private localModelsService = new LocalModelsService();
  private cacheService = new CacheService();
  private workspaceService = new WorkspaceService();

  private getAdapter(engine: NluEngineType): INluAdapter {
    switch (engine) {
      case 'dialogflow':
        return this.dialogflowAdapter;
      case 'rasa':
        return this.rasaAdapter;
      case 'botframework':
        return this.botFrameworkAdapter;
      case 'local':
      default:
        return this.localAdapter;
    }
  }

  static getActiveEngine(): NluEngineType {
    return this.activeEngine;
  }

  static setActiveEngine(engine: NluEngineType) {
    this.activeEngine = engine;
    logger.info(`Active NLU engine updated to: ${engine}`);
  }

  static getPendingAction(sessionId: string): PendingAction | undefined {
    return this.pendingActions.get(sessionId);
  }

  static setPendingAction(sessionId: string, pending: PendingAction) {
    this.pendingActions.set(sessionId, pending);
  }

  static clearPendingAction(sessionId: string) {
    this.pendingActions.delete(sessionId);
  }

  async processMessage(
    text: string,
    sessionId: string = 'default'
  ): Promise<{
    response: string;
    intent: string;
    confidence: number;
    entities: Record<string, any>;
    actionExecuted?: string;
    pendingConfirmation?: boolean;
  }> {
    const query = text.toLowerCase().trim();

    // 1. Check if there is a pending confirmation action for this session
    const pending = AssistantService.getPendingAction(sessionId);
    if (pending) {
      if (['yes', 'y', 'confirm', 'do it', 'go ahead', 'ok', 'okay'].includes(query)) {
        // Execute the pending action
        const result = await this.executeAction(pending.action, pending.entities);
        AssistantService.clearPendingAction(sessionId);
        return {
          response: result.message,
          intent: pending.action,
          confidence: 1.0,
          entities: pending.entities,
          actionExecuted: pending.action,
        };
      } else if (['no', 'n', 'cancel', 'stop', 'abort'].includes(query)) {
        AssistantService.clearPendingAction(sessionId);
        return {
          response: 'Action cancelled.',
          intent: 'action.cancel',
          confidence: 1.0,
          entities: {},
        };
      } else {
        return {
          response: `A pending action requires confirmation. ${pending.confirmationMessage} Reply 'yes' to proceed, or 'no' to cancel.`,
          intent: 'action.pending_confirmation',
          confidence: 1.0,
          entities: {},
          pendingConfirmation: true,
        };
      }
    }

    // 2. Parse using the active adapter
    const adapter = this.getAdapter(AssistantService.activeEngine);
    const parsed = await adapter.parse(text, sessionId);
    const { intent, confidence, entities } = parsed;

    // 3. Handle Safeguards: Check if intent is destructive / requires confirmation
    if (intent === 'cache.clear') {
      const confirmationMessage = 'Are you sure you want to clear the system cache?';
      AssistantService.setPendingAction(sessionId, {
        action: intent,
        entities,
        confirmationMessage,
      });
      return {
        response: `${confirmationMessage} Reply 'yes' to confirm or 'no' to cancel.`,
        intent,
        confidence,
        entities,
        pendingConfirmation: true,
      };
    }

    if (intent === 'workspace.change') {
      const path = entities.path || '';
      if (!path) {
        return {
          response: 'Please provide a valid workspace path to switch to.',
          intent,
          confidence,
          entities,
        };
      }
      const confirmationMessage = `Are you sure you want to switch the workspace path to: ${path}?`;
      AssistantService.setPendingAction(sessionId, {
        action: intent,
        entities,
        confirmationMessage,
      });
      return {
        response: `${confirmationMessage} Reply 'yes' to confirm or 'no' to cancel.`,
        intent,
        confidence,
        entities,
        pendingConfirmation: true,
      };
    }

    // 4. Immediately execute non-destructive actions
    if (intent !== 'input.unknown') {
      try {
        const result = await this.executeAction(intent, entities);
        return {
          response: result.message,
          intent,
          confidence,
          entities,
          actionExecuted: intent,
        };
      } catch (err: any) {
        logger.error({ err: err.message, intent }, 'Failed to execute assistant action');
        return {
          response: `Failed to execute action for intent ${intent}: ${err.message}`,
          intent,
          confidence,
          entities,
        };
      }
    }

    // 5. Fallback/Default response
    return {
      response:
        parsed.fulfillmentText ||
        "I'm not sure how to help with that. Try asking about system health, cache statistics, or listing models.",
      intent,
      confidence,
      entities,
    };
  }

  private async executeAction(
    intent: string,
    entities: Record<string, any>
  ): Promise<{ message: string }> {
    switch (intent) {
      case 'system.health': {
        const health = await this.systemService.getHealth();
        const deps = health.checks.dependencies;
        const depStatus = Object.entries(deps)
          .map(([name, status]) => `${name}: ${status}`)
          .join(', ');
        return {
          message: `System status is currently: ${health.overall.toUpperCase()}. Services details: ${depStatus}.`,
        };
      }

      case 'system.metrics': {
        const metrics = await this.systemService.getMetrics();
        const usageMb = Math.round(metrics.memory.heapUsed / 1024 / 1024);
        const hitRatePct = (metrics.hitRate * 100).toFixed(1);
        return {
          message: `System metrics: Uptime: ${Math.round(metrics.uptime)} seconds. Memory Heap Used: ${usageMb} MB. Cache Hit Rate: ${hitRatePct}% (Hits: ${metrics.cacheStats.hits}, Misses: ${metrics.cacheStats.misses}).`,
        };
      }

      case 'model.list': {
        return {
          message: `Local model management is delegated to Ollama and LM Studio. Check your provider settings.`,
        };
      }

      case 'model.status': {
        return {
          message: `Check your Ollama or LM Studio interface for running model status.`,
        };
      }

      case 'model.switch': {
        return {
          message: `Model switching should be done via the client UI or externally.`,
        };
      }

      case 'cache.stats': {
        const stats = await this.cacheService.getStats();
        const total = stats.hits + stats.misses;
        const rate = total > 0 ? (stats.hits / total) * 100 : 0;
        return {
          message: `Cache Statistics: Hits: ${stats.hits}, Misses: ${stats.misses}, Total requests: ${total}. Hit rate: ${rate.toFixed(1)}%.`,
        };
      }

      case 'cache.clear': {
        await this.cacheService.clear();
        return {
          message: 'System cache cleared successfully.',
        };
      }

      case 'workspace.info': {
        const workspace = this.workspaceService.getWorkspace();
        return {
          message: `The active workspace directory is: ${workspace || 'Not set'}.`,
        };
      }

      case 'workspace.change': {
        const path = entities.path;
        if (!path) {
          return { message: 'Could not change workspace: path not specified.' };
        }
        this.workspaceService.setWorkspace(path);
        return {
          message: `Workspace root successfully updated to: ${path}.`,
        };
      }

      default:
        throw new Error(`Unhandled action execution for intent: ${intent}`);
    }
  }

  async getConfig(): Promise<{
    activeEngine: NluEngineType;
    engines: Record<NluEngineType, { status: 'ready' | 'mock_fallback'; details?: string }>;
  }> {
    const dialogflowProject = env.DIALOGFLOW_PROJECT_ID;
    const dialogflowToken = env.DIALOGFLOW_ACCESS_TOKEN;
    const rasaUrl = env.RASA_URL || 'http://localhost:5005';

    return {
      activeEngine: AssistantService.activeEngine,
      engines: {
        local: { status: 'ready', details: 'Heuristic keyword and regex engine' },
        dialogflow: {
          status: dialogflowProject && dialogflowToken ? 'ready' : 'mock_fallback',
          details:
            dialogflowProject && dialogflowToken
              ? `Dialogflow Project: ${dialogflowProject}`
              : 'DIALOGFLOW_PROJECT_ID or DIALOGFLOW_ACCESS_TOKEN env var is missing. Running in local fallback mode.',
        },
        rasa: {
          status: 'ready', // Rasa performs lazy connection check, fallback mode is active if Rasa server is offline
          details: `Rasa Endpoint: ${rasaUrl}`,
        },
        botframework: {
          status: 'ready',
          details:
            'Accepts Bot Framework Activity schema payloads or falls back to local text processing',
        },
      },
    };
  }
}
