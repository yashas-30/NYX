import { eq } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import { promptTemplates } from '../../db/schema.ts';
import crypto from 'crypto';

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  type: string;
}

export class PromptTemplatesStore {
  async list(): Promise<PromptTemplate[]> {
    return db.select().from(promptTemplates).all();
  }

  async get(id: string): Promise<PromptTemplate | null> {
    const res = db.select().from(promptTemplates).where(eq(promptTemplates.id, id)).all();
    return res[0] ?? null;
  }

  async create(data: Omit<PromptTemplate, 'id'>): Promise<PromptTemplate> {
    const id = `prompt_template-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const newTemplate = { id, ...data };
    db.insert(promptTemplates).values(newTemplate).run();
    return newTemplate;
  }

  async update(id: string, data: Partial<Omit<PromptTemplate, 'id'>>): Promise<void> {
    db.update(promptTemplates).set(data).where(eq(promptTemplates.id, id)).run();
  }

  async delete(id: string): Promise<void> {
    db.delete(promptTemplates).where(eq(promptTemplates.id, id)).run();
  }
}
