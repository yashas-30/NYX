export interface A2AMessage {
  from: string; // agent ID
  to: string;   // target agent ID
  type: 'task' | 'query' | 'response' | 'delegate';
  payload: {
    task?: string;
    context?: any;
    result?: any;
  };
  correlationId: string;
}
