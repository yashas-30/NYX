import { Server as SocketIOServer, Socket, Namespace } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { verifySessionToken } from '../features/vault/vault.service.js';
import logger from '../lib/logger.js';
import { UnifiedEngine } from '../lib/unifiedEngine.js';

let io: SocketIOServer | null = null;
let aiNamespace: Namespace | null = null;
let downloadsNamespace: Namespace | null = null;
let terminalNamespace: Namespace | null = null;

/**
 * Attach Socket.IO to Fastify's underlying http.Server.
 * Must be called BEFORE fastify.listen().
 */
export function initializeWebSocket(fastify: FastifyInstance): SocketIOServer {
  // fastify.server IS the Node http.Server — attach directly, never wrap it
  io = new SocketIOServer(fastify.server, {
    cors: {
      origin: process.env.NODE_ENV === 'development' ? '*' : false,
      credentials: true,
    },
    pingTimeout: 60_000,
    pingInterval: 25_000,
    transports: ['websocket', 'polling'],
    path: '/ws/socket.io',
  });

  aiNamespace = io.of('/ai');
  downloadsNamespace = io.of('/downloads');
  terminalNamespace = io.of('/terminal');

  const authMiddleware = async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token || !verifySessionToken(token as string)) {
        return next(new Error('Unauthorized'));
      }
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  };

  aiNamespace.use(authMiddleware);
  downloadsNamespace.use(authMiddleware);
  terminalNamespace.use(authMiddleware);

  // ── AI streaming namespace ────────────────────────────────────────────────
  aiNamespace.on('connection', (socket: Socket) => {
    logger.info(`[WS:AI] Client connected: ${socket.id}`);

    socket.on('stream-request', async (data: {
      modelId: string;
      provider: string;
      prompt: string;
      settings?: Record<string, any>;
      history?: import('@nyx/shared').ChatMessage[];
      agentType?: 'chat' | 'opencode';
    }) => {
      const { modelId, provider, prompt, settings, history, agentType } = data;
      try {
        const { AgentsService } = await import('../features/agents/agents.service.js');
        const agentService = new AgentsService();
        
        await agentService.executeAgentStream(
          {
            model: modelId,
            provider,
            prompt,
            history,
            settings,
            agentType: agentType || 'chat',
          },
          (chunk: any) => {
            socket.emit('stream-chunk', chunk);
          },
          () => {
            socket.emit('stream-chunk', { done: true });
          }
        );
      } catch (error: any) {
        logger.error({ error }, '[WS:AI] Stream error');
        socket.emit('stream-error', { message: error.message, code: error.code });
      }
    });

    socket.on('disconnect', (reason: string) => {
      logger.info(`[WS:AI] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  // ── Downloads namespace ───────────────────────────────────────────────────
  downloadsNamespace.on('connection', (socket: Socket) => {
    logger.info(`[WS:Downloads] Client connected: ${socket.id}`);

    socket.on('subscribe-download', (modelId: string) => {
      socket.join(`download:${modelId}`);
      logger.debug(`[WS:Downloads] ${socket.id} subscribed to download:${modelId}`);
    });

    socket.on('unsubscribe-download', (modelId: string) => {
      socket.leave(`download:${modelId}`);
      logger.debug(`[WS:Downloads] ${socket.id} unsubscribed from download:${modelId}`);
    });

    socket.on('disconnect', (reason: string) => {
      logger.info(`[WS:Downloads] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  // ── Terminal namespace ────────────────────────────────────────────────────
  terminalNamespace.on('connection', (socket: Socket) => {
    logger.info(`[WS:Terminal] Client connected: ${socket.id}`);

    socket.on('terminal-command', (data: { command: string; cols?: number; rows?: number }) => {
      socket.emit('terminal-output', { output: `Executing: ${data.command}\r\n`, done: false });
    });

    socket.on('disconnect', (reason: string) => {
      logger.info(`[WS:Terminal] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  io.on('connection', (socket: Socket) => {
    logger.debug(`[WS] Root namespace client connected: ${socket.id}`);
  });

  // Graceful shutdown: close Socket.IO when Fastify closes
  fastify.addHook('onClose', async () => {
    if (io) {
      await io.close();
      logger.info('[WS] Socket.IO server closed');
    }
  });

  logger.info('[WS] Socket.IO initialized on namespaces: /ai, /downloads, /terminal');
  return io;
}

export function getWebSocketServer(): SocketIOServer | null { return io; }
export function getAINamespace(): Namespace | null { return aiNamespace; }
export function getDownloadsNamespace(): Namespace | null { return downloadsNamespace; }
export function getTerminalNamespace(): Namespace | null { return terminalNamespace; }

export function emitDownloadProgress(modelId: string, progress: {
  status: 'downloading' | 'completed' | 'failed' | 'verifying' | 'paused' | 'idle';
  downloadedBytes?: number;
  totalBytes?: number;
  percentage?: number;
  speedBytesPerSec?: number;
  error?: string;
}): void {
  downloadsNamespace?.to(`download:${modelId}`).emit('progress', {
    modelId, ...progress, timestamp: Date.now(),
  });
}

export function emitTerminalOutput(sessionId: string, output: string, done = false): void {
  terminalNamespace?.to(`terminal:${sessionId}`).emit('output', { output, done, timestamp: Date.now() });
}

export function emitAgentEvent(
  event: 'started' | 'thinking' | 'tool_call' | 'tool_result' | 'completed' | 'error',
  data: any
): void {
  aiNamespace?.emit('agent-event', { type: event, ...data, timestamp: Date.now() });
}