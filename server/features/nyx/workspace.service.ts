import logger from '../../lib/logger.ts';
import { WorkspaceIntelligence } from '../workspace/workspaceIntelligence.ts';
import { getWorkspaceRoot } from '../../lib/paths.ts';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class WorkspaceService {
  async getProfile() {
    return await WorkspaceIntelligence.getProfile();
  }

  trackOpenFiles(openFiles: string[]) {
    WorkspaceIntelligence.trackOpenFiles(openFiles);
  }

  /**
   * BAD-5 fix: Check if lint script exists before running it.
   * Add monorepo detection for pnpm-workspace.yaml, lerna.json, packages/ directory.
   */
  async validateWorkspace() {
    const profile = await WorkspaceIntelligence.getProfile();
    const root = getWorkspaceRoot();

    // Monorepo detection
    const isMonorepo =
      fs.existsSync(path.join(root, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(root, 'lerna.json')) ||
      (fs.existsSync(path.join(root, 'packages')) &&
        fs.statSync(path.join(root, 'packages')).isDirectory());

    if (isMonorepo) {
      // For monorepos, run tsc check at root level only — skip lint
      if (fs.existsSync(path.join(root, 'tsconfig.json'))) {
        try {
          const { stdout } = await execAsync('npx tsc --noEmit', { cwd: root, timeout: 30_000 });
          return { success: true, stdout, monorepo: true };
        } catch (error: any) {
          return {
            success: false,
            error: error.stderr || error.stdout || error.message,
            monorepo: true,
          };
        }
      }
      return {
        success: true,
        message: 'Monorepo detected — skipped lint (no root tsconfig found)',
        monorepo: true,
      };
    }

    let command = '';

    if (profile.projectType === 'react' || profile.projectType === 'node') {
      if (fs.existsSync(path.join(root, 'tsconfig.json'))) {
        command = 'npx tsc --noEmit';
      } else {
        // BAD-5: Check if lint script actually exists in package.json before running it
        const pkgJsonPath = path.join(root, 'package.json');
        let hasLintScript = false;
        if (fs.existsSync(pkgJsonPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
            hasLintScript = !!(pkg.scripts && pkg.scripts.lint);
          } catch {
            /* ignore */
          }
        }
        if (hasLintScript) {
          if (profile.packageManager === 'pnpm') {
            command = 'pnpm run lint';
          } else if (profile.packageManager === 'yarn') {
            command = 'yarn run lint';
          } else {
            command = 'npm run lint';
          }
        }
      }
    } else if (profile.projectType === 'rust') {
      command = 'cargo check';
    } else if (profile.projectType === 'python') {
      command = 'python -m compileall -q .';
    } else if (profile.projectType === 'go') {
      command = 'go build -o /dev/null ./...';
    }

    if (!command) {
      return { success: true, message: 'No validation command defined for this project type' };
    }

    logger.info(`[Validation] Running validation command: "${command}" in ${root}`);
    try {
      const { stdout } = await execAsync(command, { cwd: root, timeout: 25_000 });
      return { success: true, stdout };
    } catch (error: any) {
      logger.warn(`[Validation] Validation failed:`, error.stderr || error.stdout || error.message);
      return {
        success: false,
        error: error.stderr || error.stdout || error.message,
      };
    }
  }
}
