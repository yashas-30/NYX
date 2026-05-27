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

  async validateWorkspace() {
    const profile = await WorkspaceIntelligence.getProfile();
    const root = getWorkspaceRoot();
    let command = '';

    if (profile.projectType === 'react' || profile.projectType === 'node') {
      if (fs.existsSync(path.join(root, 'tsconfig.json'))) {
        command = 'npx tsc --noEmit';
      } else if (profile.packageManager === 'pnpm') {
        command = 'pnpm run lint';
      } else if (profile.packageManager === 'yarn') {
        command = 'yarn run lint';
      } else {
        command = 'npm run lint';
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

    console.log(`[Validation] Running validation command: "${command}" in ${root}`);
    try {
      const { stdout } = await execAsync(command, { cwd: root, timeout: 25_000 });
      return { success: true, stdout };
    } catch (err: any) {
      console.warn(`[Validation] Validation failed:`, err.stderr || err.stdout || err.message);
      return {
        success: false,
        error: err.stderr || err.stdout || err.message
      };
    }
  }
}
