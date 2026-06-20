import { getWorkspaceRoot, setWorkspaceRoot } from '../../lib/paths.js';
import { db } from '../../db/client.js';
import { projects } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export class WorkspaceService {
  getWorkspace() {
    return getWorkspaceRoot();
  }

  setWorkspace(newPath: string) {
    return setWorkspaceRoot(newPath);
  }

  async selectWorkspace() {
    return {
      fallback: true,
      message: 'Native selection unavailable in server context: please input path manually',
    };
  }

  async createWorkspace(dirPath: string, name?: string) {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const targetDir = name ? path.join(dirPath, name) : dirPath;

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const readmePath = path.join(targetDir, 'README.md');
      if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(
          readmePath,
          `# ${name || path.basename(targetDir)}\n\nInitialized by NYX Coder agent.\n`
        );
      }

      setWorkspaceRoot(targetDir);
      return { success: true, workspace: targetDir };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getProjects() {
    const allProjects = await db.select().from(projects);
    return allProjects.map(p => ({
      ...p,
      files: JSON.parse(p.files || '[]'),
      sessions: JSON.parse(p.sessions || '[]')
    }));
  }

  async createProject(data: any) {
    const newId = `proj-${Date.now()}`;
    const proj = {
      id: newId,
      name: data.name,
      description: data.description || '',
      icon: data.icon || '📁',
      model: data.model || 'gemini-2.5-flash',
      instructions: data.instructions || '',
      files: JSON.stringify(data.files || []),
      sessions: JSON.stringify(data.sessions || []),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await db.insert(projects).values(proj);
    return {
      ...proj,
      files: JSON.parse(proj.files),
      sessions: JSON.parse(proj.sessions)
    };
  }

  async updateProject(id: string, updates: any) {
    const updateData: any = { updatedAt: new Date() };
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.icon !== undefined) updateData.icon = updates.icon;
    if (updates.model !== undefined) updateData.model = updates.model;
    if (updates.instructions !== undefined) updateData.instructions = updates.instructions;
    if (updates.files !== undefined) updateData.files = JSON.stringify(updates.files);
    if (updates.sessions !== undefined) updateData.sessions = JSON.stringify(updates.sessions);

    await db.update(projects).set(updateData).where(eq(projects.id, id));
    
    const [updated] = await db.select().from(projects).where(eq(projects.id, id));
    if (!updated) return null;
    return {
      ...updated,
      files: JSON.parse(updated.files || '[]'),
      sessions: JSON.parse(updated.sessions || '[]')
    };
  }

  async deleteProject(id: string) {
    await db.delete(projects).where(eq(projects.id, id));
    return { success: true };
  }
}
