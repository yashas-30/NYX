import { PromptAnalysisService } from '../ai/services/promptAnalysis.service';

export type SupervisorNode = 'ROUTER' | 'CLOUD_SUPERVISOR' | 'LOCAL_EXECUTOR' | 'END';

export interface SupervisorState {
  query: string;
  context: any;
  history: string[];
  route?: 'LOCAL' | 'CLOUD';
  result?: string;
  currentNode: SupervisorNode;
  logs: string[];
}

const promptAnalyzer = new PromptAnalysisService();

/**
 * Lightweight DAG Supervisor for multi-agent execution.
 * Keeps latency low by avoiding external libraries like LangGraph.
 */
export async function runSupervisorDAG(query: string, context: any, history: string[] = []): Promise<SupervisorState> {
  let state: SupervisorState = {
    query,
    context,
    history,
    currentNode: 'ROUTER',
    logs: []
  };

  while (state.currentNode !== 'END') {
    state = await stepDAG(state);
  }

  return state;
}

/**
 * Executes a single step of the DAG State Machine
 */
async function stepDAG(state: SupervisorState): Promise<SupervisorState> {
  const nextState = { ...state };
  
  switch (state.currentNode) {
    case 'ROUTER': {
      nextState.logs.push('Running ROUTER node...');
      
      try {
        const analysis = await promptAnalyzer.analyze(state.query, {
          useEmbedding: true,
          history: state.history.slice(-5)
        });

        // 1. Semantic Router (Intent Matching)
        const isBoilerplateIntent = ['conversation', 'command'].includes(analysis.intent || '');
        
        // 2. Complexity Classifier
        const requiresFrontierModel = (analysis.estimatedComplexity || 1) >= 3 || 
                                      analysis.needsToolUse || 
                                      analysis.suggestedModel === 'reasoning' ||
                                      analysis.requiresReasoning;

        if (isBoilerplateIntent && !requiresFrontierModel) {
          nextState.route = 'LOCAL';
        } else if (requiresFrontierModel) {
          nextState.route = 'CLOUD';
        } else {
          // Fallback for moderate tasks
          nextState.route = analysis.confidence > 0.85 ? 'LOCAL' : 'CLOUD';
        }

        nextState.logs.push(`ROUTER decided: ${nextState.route}`);
        nextState.currentNode = nextState.route === 'CLOUD' ? 'CLOUD_SUPERVISOR' : 'LOCAL_EXECUTOR';
      } catch (e: any) {
        nextState.logs.push(`ROUTER failed (${e.message}), defaulting to CLOUD`);
        nextState.route = 'CLOUD';
        nextState.currentNode = 'CLOUD_SUPERVISOR';
      }
      break;
    }
    
    case 'CLOUD_SUPERVISOR': {
      nextState.logs.push('Running CLOUD_SUPERVISOR node...');
      // Delegate to Cloud Supervisor logic here
      nextState.result = `[Cloud Supervisor] Execution completed for query: "${state.query}"`;
      nextState.currentNode = 'END';
      break;
    }

    case 'LOCAL_EXECUTOR': {
      nextState.logs.push('Running LOCAL_EXECUTOR node (Distilled Context worker)...');
      // Delegate to Local Executor / Distilled Context worker to offload heavy log/file parsing locally
      nextState.result = `[Local Executor] Distilled execution completed for query: "${state.query}"`;
      nextState.currentNode = 'END';
      break;
    }

    case 'END':
    default:
      nextState.currentNode = 'END';
      break;
  }

  return nextState;
}
