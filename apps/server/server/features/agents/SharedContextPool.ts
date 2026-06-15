import { db } from '../../db/client.js';
import { swarmContextPool } from '../../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../lib/logger.js';

export class SharedContextPool {
  /**
   * Write an agent's findings/output into the shared context pool for a given swarm session.
   */
  static async writeContext(sessionId: string, agentId: string, task: string, content: string): Promise<void> {
    try {
      await db.insert(swarmContextPool).values({
        id: uuidv4(),
        sessionId,
        agentId,
        task,
        content,
        timestamp: Date.now(),
      });
      logger.info(`[SharedContextPool] Written output for agent ${agentId} to session ${sessionId}`);
    } catch (err: any) {
      logger.error(`[SharedContextPool] Failed to write context: ${err.message}`);
    }
  }

  /**
   * Retrieve all context from the pool for a specific swarm session, formatted as a single string.
   */
  static async getContext(sessionId: string): Promise<string> {
    try {
      const entries = await db
        .select()
        .from(swarmContextPool)
        .where(eq(swarmContextPool.sessionId, sessionId))
        .orderBy(asc(swarmContextPool.timestamp));

      if (entries.length === 0) return '';

      return entries.map((e: any) => `\n\n--- Memory from ${e.agentId} (Task: ${e.task}) ---\n${e.content}`).join('');
    } catch (err: any) {
      logger.error(`[SharedContextPool] Failed to get context: ${err.message}`);
      return '';
    }
  }
}
