import { FastifyReply } from 'fastify';
import { createSessionToken } from '../features/vault/vault.service.js';

/**
 * Sends a cryptographically fresh rotated session token as SSE metadata.
 * Should be called immediately after flushing event-stream headers.
 */
export function sendSseTokenRotate(res: FastifyReply): void {
  const newToken = createSessionToken(false);
  const sseMetadata = `event: metadata\ndata: ${JSON.stringify({ tokenRotate: newToken })}\n\n`;
  res.raw.write(sseMetadata, 'utf8');
}

/**
 * AG-UI Event Types
 */
// We define 16 event types as per the requirement.
export type AgUiEventType =
  | 'run-started'
  | 'run-finished'
  | 'run-error'
  | 'text-message-start'
  | 'text-message-content'
  | 'text-message-end'
  | 'tool-call-start'
  | 'tool-call-end'
  | 'tool-call-result'
  | 'state-update'
  | 'agent-updated'
  | 'agent-finished'
  | 'agent-error'
  | 'heartbeat'
  | 'custom';

export interface RunStartedEvent {
  type: 'run-started';
  timestamp: number;
}

export interface RunFinishedEvent {
  type: 'run-finished';
  timestamp: number;
}

export interface RunErrorEvent {
  type: 'run-error';
  error: string;
  timestamp: number;
}

export interface TextMessageStartEvent {
  type: 'text-message-start';
  messageId: string;
  timestamp: number;
}

export interface TextMessageContentEvent {
  type: 'text-message-content';
  messageId: string;
  content: string;
  timestamp: number;
}

export interface TextMessageEndEvent {
  type: 'text-message-end';
  messageId: string;
  timestamp: number;
}

export interface ToolCallStartEvent {
  type: 'tool-call-start';
  toolCallId: string;
  toolName: string;
  timestamp: number;
}

export interface ToolCallEndEvent {
  type: 'tool-call-end';
  toolCallId: string;
  timestamp: number;
}

export interface ToolCallResultEvent {
  type: 'tool-call-result';
  toolCallId: string;
  result: any;
  timestamp: number;
}

export interface StateUpdateEvent {
  type: 'state-update';
  state: any;
  timestamp: number;
}

export interface AgentUpdatedEvent {
  type: 'agent-updated';
  agent: any;
  timestamp: number;
}

export interface AgentFinishedEvent {
  type: 'agent-finished';
  agentId: string;
  timestamp: number;
}

export interface AgentErrorEvent {
  type: 'agent-error';
  agentId: string;
  error: string;
  timestamp: number;
}

export interface HeartbeatEvent {
  type: 'heartbeat';
  timestamp: number;
}

export interface CustomEvent {
  type: 'custom';
  [key: string]: any;
  timestamp: number;
}

export type AgUiEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | StateUpdateEvent
  | AgentUpdatedEvent
  | AgentFinishedEvent
  | AgentErrorEvent
  | HeartbeatEvent
  | CustomEvent;

/**
 * Emits an AG-UI event as SSE.
 * @param res - Fastify reply object
 * @param event - AG-UI event to emit
 */
export function emitAgUiEvent(res: FastifyReply, event: AgUiEvent): void {
  const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  res.raw.write(sseData, 'utf8');
}