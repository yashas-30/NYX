import { getWorkspaceRoot, setWorkspaceRoot } from '../../lib/paths.ts';

export class WorkspaceService {
  getWorkspace() {
    return getWorkspaceRoot();
  }

  setWorkspace(newPath: string) {
    return setWorkspaceRoot(newPath);
  }

  async selectWorkspace() {
    if (process.versions.electron) {
      const { dialog } = await import('electron');
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Active Codebase Workspace'
      });
      if (!result.canceled && result.filePaths.length > 0) {
        const selectedDir = result.filePaths[0];
        setWorkspaceRoot(selectedDir);
        return { success: true, workspace: selectedDir };
      }
      return { success: false, message: 'Selection cancelled' };
    }
    return { fallback: true, message: 'Web environment: please input path manually' };
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
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
}
