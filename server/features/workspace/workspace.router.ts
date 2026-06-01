import { Router } from 'express';
import { validate } from '../../middleware/validate.ts';
import { WorkspaceService } from './workspace.service.ts';
import { workspaceSchema } from './workspace.schema.ts';

export const workspaceRouter = Router();
const service = new WorkspaceService();

workspaceRouter.get('/', (req, res) => {
  res.json({ workspace: service.getWorkspace() });
});

workspaceRouter.post('/', validate(workspaceSchema), (req, res) => {
  const { path: newPath } = req.body;
  const success = service.setWorkspace(newPath);
  if (success) {
    res.json({ success: true, workspace: service.getWorkspace() });
  } else {
    res.status(400).json({ error: 'Directory does not exist or is invalid' });
  }
});

workspaceRouter.post('/select', async (req, res) => {
  try {
    const result = await service.selectWorkspace();
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: `Native dialog error: ${error.message}` });
  }
});

workspaceRouter.post('/create', async (req, res) => {
  try {
    const { path: dirPath, name } = req.body;
    if (!dirPath) {
      return res.status(400).json({ error: 'Directory path is required' });
    }
    const result = await service.createWorkspace(dirPath, name);
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error: any) {
    return res.status(500).json({ error: `Failed to create workspace: ${error.message}` });
  }
});
