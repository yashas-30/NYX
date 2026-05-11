import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
export const terminalRouter = Router();

terminalRouter.post('/run', async (req, res) => {
  const { command, cwd } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: "Command is required" });
  }

  // Security: In a real app, you'd want to restrict commands.
  // For this local lab, we allow full access as requested by the user.
  
  try {
    const { stdout, stderr } = await execPromise(command, { 
      cwd: cwd || process.cwd(),
      env: { ...process.env, FORCE_COLOR: '1' }
    });
    
    res.json({ stdout, stderr });
  } catch (error: any) {
    res.status(500).json({ 
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr 
    });
  }
});
