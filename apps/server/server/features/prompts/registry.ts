import { db, isPg } from '../../db/client.js';
import { promptVersions, pgPromptVersions } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';

export interface PromptVersion {
  id: string;
  name: string;
  content: string;
  version: number;
  createdAt: number;
  metrics: {
    avgTokens: number | null;
    avgLatency: number | null;
    successRate: number | null;
    userRating: number | null;
  };
  isActive: boolean;
}

export class PromptRegistry {
  async register(name: string, content: string): Promise<PromptVersion> {
    const current = await this.getActive(name);
    const version = current ? current.version + 1 : 1;
    const id = `${name}-v${version}`;

    // Deactivate previous
    if (current) {
      if (isPg) {
        await db.update(pgPromptVersions)
          .set({ isActive: 0 })
          .where(eq(pgPromptVersions.id, current.id));
      } else {
        await db.update(promptVersions)
          .set({ isActive: false })
          .where(eq(promptVersions.id, current.id));
      }
    }

    // Insert new
    if (isPg) {
      await db.insert(pgPromptVersions).values({
        id,
        name,
        content,
        version,
        isActive: 1,
      });
    } else {
      await db.insert(promptVersions).values({
        id,
        name,
        content,
        version,
        createdAt: Date.now(),
        isActive: true,
      });
    }

    return {
      id,
      name,
      content,
      version,
      createdAt: Date.now(),
      metrics: { avgTokens: null, avgLatency: null, successRate: null, userRating: null },
      isActive: true,
    };
  }

  async getActive(name: string): Promise<PromptVersion | null> {
    let row: any;
    if (isPg) {
      row = await db.query.pgPromptVersions.findFirst({
        where: and(eq(pgPromptVersions.name, name), eq(pgPromptVersions.isActive, 1)),
      });
    } else {
      row = await db.query.promptVersions.findFirst({
        where: and(eq(promptVersions.name, name), eq(promptVersions.isActive, true)),
      });
    }

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      content: row.content,
      version: row.version,
      createdAt: isPg && row.createdAt instanceof Date ? row.createdAt.getTime() : row.createdAt,
      metrics: {
        avgTokens: row.avgTokens,
        avgLatency: row.avgLatency,
        successRate: row.successRate,
        userRating: row.userRating,
      },
      isActive: row.isActive ? true : false,
    };
  }

  async updateMetrics(id: string, metrics: {
    avgTokens?: number;
    avgLatency?: number;
    successRate?: number;
    userRating?: number;
  }): Promise<void> {
    if (isPg) {
      await db.update(pgPromptVersions)
        .set(metrics)
        .where(eq(pgPromptVersions.id, id));
    } else {
      await db.update(promptVersions)
        .set(metrics)
        .where(eq(promptVersions.id, id));
    }
  }
}

export const promptRegistry = new PromptRegistry();
