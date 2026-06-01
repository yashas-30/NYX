import { getWorkspaceRoot, setWorkspaceRoot } from '../../lib/paths.ts';

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

      // Initialize basic files
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
}
