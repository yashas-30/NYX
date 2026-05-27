import { exec } from 'child_process';
import { promisify } from 'util';
import { getWorkspaceRoot } from '../../lib/paths.ts';

const execAsync = promisify(exec);

export class GitIntegration {
  static async isRepo(): Promise<boolean> {
    try {
      const cwd = getWorkspaceRoot();
      await execAsync('git rev-parse --git-dir', { cwd });
      return true;
    } catch {
      return false;
    }
  }

  static async getStatus(): Promise<{ modified: string[]; untracked: string[]; staged: string[] }> {
    const cwd = getWorkspaceRoot();
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd });
      const lines = stdout.trim().split('\n').filter(Boolean);
      return {
        modified: lines.filter(l => l.startsWith(' M') || l.startsWith('MM') || l.startsWith('M ')).map(l => l.slice(3)),
        untracked: lines.filter(l => l.startsWith('??')).map(l => l.slice(3)),
        staged: lines.filter(l => l.startsWith('A ') || l.startsWith('M ') || l.startsWith('D ')).map(l => l.slice(3)),
      };
    } catch (err: any) {
      console.error('[GitIntegration] Failed to get status:', err.message);
      return { modified: [], untracked: [], staged: [] };
    }
  }

  static async createSnapshot(message: string): Promise<string> {
    const cwd = getWorkspaceRoot();
    const timestamp = new Date().toISOString();
    const branchName = `nyx-agent-${timestamp.replace(/[:.]/g, '-')}`;
    try {
      await execAsync(`git checkout -b ${branchName}`, { cwd });
      await execAsync('git add -A', { cwd });
      await execAsync(`git commit -m "[NYX Agent] ${message}" --no-verify`, { cwd });
      return branchName;
    } catch (err: any) {
      console.error('[GitIntegration] Snapshot creation failed:', err.message);
      throw err;
    }
  }

  static async getDiff(filePath?: string): Promise<string> {
    const cwd = getWorkspaceRoot();
    try {
      const cmd = filePath ? `git diff HEAD -- "${filePath}"` : 'git diff HEAD';
      const { stdout } = await execAsync(cmd, { cwd });
      return stdout;
    } catch (err: any) {
      console.error('[GitIntegration] Failed to get diff:', err.message);
      return '';
    }
  }
}
