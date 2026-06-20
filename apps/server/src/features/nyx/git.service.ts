import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../../lib/logger.js';

const execAsync = promisify(exec);

export class GitService {
  private static async isGitRepo(cwd?: string): Promise<boolean> {
    try {
      await execAsync('git rev-parse --is-inside-work-tree', { cwd, timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }

  async getDiff(filePath?: string, cwd?: string) {
    try {
      if (!(await GitService.isGitRepo(cwd))) {
        return { success: false, diff: '', message: 'Not a git repository' };
      }
      const cmd = filePath ? `git diff HEAD -- "${filePath}"` : 'git diff HEAD';
      const { stdout } = await execAsync(cmd, { cwd, timeout: 10_000 });
      return { success: true, diff: stdout };
    } catch (error: any) {
      logger.warn({ error: error.message }, '[GitService] getDiff failed');
      return { success: false, diff: '', message: error.message || 'git diff failed' };
    }
  }

  async getStatus(cwd?: string) {
    try {
      if (!(await GitService.isGitRepo(cwd))) {
        return { success: false, status: { branch: '', ahead: 0, behind: 0, modified: [], added: [], deleted: [], untracked: [], renamed: [] }, message: 'Not a git repository' };
      }
      const { stdout } = await execAsync('git status --porcelain=v1 -b', { cwd, timeout: 10_000 });
      
      const lines = stdout.split('\n').filter(Boolean);
      const status = {
        branch: '',
        ahead: 0,
        behind: 0,
        modified: [] as string[],
        added: [] as string[],
        deleted: [] as string[],
        untracked: [] as string[],
        renamed: [] as string[],
      };

      for (const line of lines) {
        if (line.startsWith('## ')) {
          // Parse branch and ahead/behind
          // format: "## main...origin/main [ahead 1, behind 2]" or "## main"
          const branchMatch = line.match(/^##\s+([^\s\.]+)/);
          if (branchMatch) status.branch = branchMatch[1];

          const aheadMatch = line.match(/ahead\s+(\d+)/);
          if (aheadMatch) status.ahead = parseInt(aheadMatch[1], 10);

          const behindMatch = line.match(/behind\s+(\d+)/);
          if (behindMatch) status.behind = parseInt(behindMatch[1], 10);
          continue;
        }

        const xy = line.substring(0, 2);
        const file = line.substring(3).replace(/^"|"$/g, '');

        if (xy === '??') status.untracked.push(file);
        else if (xy.includes('A')) status.added.push(file);
        else if (xy.includes('D')) status.deleted.push(file);
        else if (xy.includes('R')) status.renamed.push(file);
        else if (xy.includes('M')) status.modified.push(file);
      }

      return { success: true, status };
    } catch (error: any) {
      logger.warn({ error: error.message }, '[GitService] getStatus failed');
      return { success: false, status: { branch: '', ahead: 0, behind: 0, modified: [], added: [], deleted: [], untracked: [], renamed: [] }, message: error.message || 'git status failed' };
    }
  }

  async getLog(n = 10, cwd?: string) {
    try {
      if (!(await GitService.isGitRepo(cwd))) {
        return { success: false, log: [], message: 'Not a git repository' };
      }
      // Use a custom format: hash|author|date|message
      const { stdout } = await execAsync(`git log -${n} --pretty=format:"%h|%an|%ar|%s" --name-only`, {
        cwd,
        timeout: 10_000,
      });

      const blocks = stdout.split('\n\n').filter(Boolean);
      const log = blocks.map(block => {
        const lines = block.split('\n').filter(Boolean);
        const [hash, author, date, message] = lines[0].split('|');
        const files = lines.slice(1);
        return { hash, author, date, message, files };
      });

      return { success: true, log };
    } catch (error: any) {
      logger.warn({ error: error.message }, '[GitService] getLog failed');
      return { success: false, log: [], message: error.message || 'git log failed' };
    }
  }

  async getBranches(cwd?: string) {
    try {
      if (!(await GitService.isGitRepo(cwd))) {
        return { success: false, branches: [], message: 'Not a git repository' };
      }
      
      const { stdout } = await execAsync('git for-each-ref --format="%(HEAD)|%(refname:short)|%(upstream:track)|%(contents:subject)|%(committerdate:relative)" refs/heads/', { cwd, timeout: 10_000 });
      const lines = stdout.split('\n').filter(Boolean);
      
      const branches = lines.map(line => {
        const [head, name, track, lastCommit, lastCommitDate] = line.split('|');
        const current = head.trim() === '*';
        
        let ahead = 0;
        let behind = 0;
        if (track) {
          const aheadMatch = track.match(/ahead\s+(\d+)/);
          if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
          
          const behindMatch = track.match(/behind\s+(\d+)/);
          if (behindMatch) behind = parseInt(behindMatch[1], 10);
        }

        return {
          name,
          current,
          ahead,
          behind,
          lastCommit,
          lastCommitDate
        };
      });

      return { success: true, branches };
    } catch (error: any) {
      logger.warn({ error: error.message }, '[GitService] getBranches failed');
      return { success: false, branches: [], message: error.message || 'git branches failed' };
    }
  }

  async stage(files: string[], cwd?: string) {
    try {
      if (!(await GitService.isGitRepo(cwd))) {
        return { success: false, message: 'Not a git repository' };
      }
      if (!files || files.length === 0) return { success: true };
      
      const fileArgs = files.map(f => `"${f}"`).join(' ');
      await execAsync(`git add ${fileArgs}`, { cwd, timeout: 10_000 });
      return { success: true };
    } catch (error: any) {
      logger.warn({ error: error.message }, '[GitService] stage failed');
      return { success: false, message: error.message || 'git add failed' };
    }
  }

  async commit(message: string, cwd?: string) {
    try {
      if (!(await GitService.isGitRepo(cwd))) {
        return { success: false, message: 'Not a git repository' };
      }
      
      const safeMessage = message.replace(/"/g, '\\"');
      await execAsync(`git commit -m "${safeMessage}"`, { cwd, timeout: 10_000 });
      return { success: true };
    } catch (error: any) {
      logger.warn({ error: error.message }, '[GitService] commit failed');
      return { success: false, message: error.message || 'git commit failed' };
    }
  }
}
