import { Role } from '../../middleware/rbac.js';

export interface Workspace {
  id: string;
  name: string;
  members: Array<{ userId: string; role: Role }>;
  settings: {
    defaultModel: string;
    tokenLimitPerDay: number;
    allowTerminal: boolean;
  };
}

export class TeamManager {
  async createWorkspace(name: string, ownerId: string): Promise<Workspace> {
    // DB interaction mocked
    return {
      id: 'ws-' + Date.now(),
      name,
      members: [{ userId: ownerId, role: Role.ADMIN }],
      settings: {
        defaultModel: 'gemini-1.5-pro',
        tokenLimitPerDay: 1000000,
        allowTerminal: true
      }
    };
  }

  async canUserExecute(workspace: Workspace, userId: string, action: string): Promise<boolean> {
    const member = workspace.members.find(m => m.userId === userId);
    if (!member) return false;
    
    if (action === 'terminal:execute' && !workspace.settings.allowTerminal) {
      return false;
    }
    return true; // Simplified check
  }
}
