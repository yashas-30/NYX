import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../../lib/logger.ts';

const execAsync = promisify(exec);

/**
 * WRONG-4 fix: git.service.ts now handles errors gracefully for non-git repos.
 * All git commands are wrapped in try-catch, and the repo is validated before
 * running commands. Returns structured empty response instead of throwing.
 */
export class GitService {
  /**
   * Checks if the given directory (or cwd) is inside a git repository.
   */
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
      const isRepo = await GitService.isGitRepo(cwd);
      if (!isRepo) {
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
      const isRepo = await GitService.isGitRepo(cwd);
      if (!isRepo) {
        return { success: false, status: '', message: 'Not a git repository' };
      }
      const { stdout } = await execAsync('git status --short', { cwd, timeout: 10_000 });
      return { success: true, status: stdout };
    } catch (error: any) {
      logger.warn({ error: error.message }, '[GitService] getStatus failed');
      return { success: false, status: '', message: error.message || 'git status failed' };
    }
  }

  async getLog(n = 10, cwd?: string) {
    try {
      const isRepo = await GitService.isGitRepo(cwd);
      if (!isRepo) {
        return { success: false, log: [], message: 'Not a git repository' };
      }
      const { stdout } = await execAsync(`git log --oneline -${n} --no-color`, {
        cwd,
        timeout: 10_000,
      });
      const log = stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, ...rest] = line.split(' ');
          return { hash, message: rest.join(' ') };
        });
      return { success: true, log };
    } catch (error: any) {
      logger.warn({ error: error.message }, '[GitService] getLog failed');
      return { success: false, log: [], message: error.message || 'git log failed' };
    }
  }
}
