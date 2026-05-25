import { Router } from 'express';
import { getWorkspaceRoot, setWorkspaceRoot } from '../lib/paths.ts';

export const workspaceRouter = Router();

workspaceRouter.get('/', (req, res) => {
  res.json({ workspace: getWorkspaceRoot() });
});

workspaceRouter.post('/', (req, res) => {
  const { path: newPath } = req.body;
  if (!newPath || typeof newPath !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid path in request body' });
  }
  if (newPath.length > 1024) {
    return res.status(400).json({ error: 'Path too long (max 1024 characters)' });
  }
  const success = setWorkspaceRoot(newPath);
  if (success) {
    res.json({ success: true, workspace: getWorkspaceRoot() });
  } else {
    res.status(400).json({ error: 'Directory does not exist or is invalid' });
  }
});

workspaceRouter.post('/select', async (req, res) => {
  if (process.versions.electron) {
    try {
      const { dialog } = await import('electron');
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Active Codebase Workspace'
      });
      if (!result.canceled && result.filePaths.length > 0) {
        const selectedDir = result.filePaths[0];
        setWorkspaceRoot(selectedDir);
        return res.json({ success: true, workspace: selectedDir });
      } else {
        return res.json({ success: false, message: 'Selection cancelled' });
      }
    } catch (e: any) {
      return res.status(500).json({ error: `Electron dialog error: ${e.message}` });
    }
  } else {
    return res.json({ fallback: true, message: 'Web environment: please input path manually' });
  }
});
