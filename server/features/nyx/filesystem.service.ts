import logger from '../../lib/logger.ts';
import fs from 'fs';
import path from 'path';
import { getWorkspaceRoot } from '../../lib/paths.ts';

export class FilesystemService {
  async writeFile(filePath: string, content: string, overwrite?: boolean) {
    const workspaceRoot = getWorkspaceRoot();

    // Normalize both paths for case-insensitive Windows comparison
    const normalizedFull = path.resolve(workspaceRoot, filePath);
    const normalizedRoot = path.resolve(workspaceRoot);
    const relative = path.relative(normalizedRoot, normalizedFull);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Directory traversal forbidden.');
    }
    const fullPath = normalizedFull;

    // Symlink protection
    if (fs.existsSync(fullPath)) {
      const lstat = fs.lstatSync(fullPath);
      if (lstat.isSymbolicLink()) {
        throw new Error('Writing to symbolic links is forbidden.');
      }
    }

    // Extension whitelist
    const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.py', '.md', '.yml', '.yaml', '.sh', '.txt', '.env']);
    const ext = path.extname(fullPath).toLowerCase();
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(`File extension '${ext}' is not allowed.`);
    }

    // Overwrite check
    if (fs.existsSync(fullPath)) {
      if (overwrite !== true) {
        return { 
          conflict: true,
          error: 'File already exists.', 
          requiresConfirmation: true, 
          path: filePath 
        };
      }

      // Perform a clean backing backup before write
      const backupsDir = path.join(workspaceRoot, '.nyx-backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }
      const timestamp = Date.now();
      const extName = path.extname(filePath);
      const base = path.basename(filePath, extName);
      const backupFileName = `${base}-${timestamp}${extName}`;
      const backupPath = path.join(backupsDir, backupFileName);
      
      try {
        await fs.promises.copyFile(fullPath, backupPath);
        logger.info(`[Backup System] Created backup of ${filePath} at: ${backupPath}`);
      } catch (backupErr: any) {
        logger.warn(`[Backup System] Failed to create backup, proceeding anyway:`, backupErr.message);
      }
    }

    // Ensure target folder exists
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    
    // Write file
    await fs.promises.writeFile(fullPath, content, 'utf8');
    logger.info(`[File System] Successfully wrote file to: ${fullPath}`);
    return { success: true, path: fullPath };
  }

  async readFile(filePath: string, startLine?: number, endLine?: number) {
    const workspaceRoot = getWorkspaceRoot();
    const normalizedFull = path.resolve(workspaceRoot, filePath);
    const normalizedRoot = path.resolve(workspaceRoot);
    const relative = path.relative(normalizedRoot, normalizedFull);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Directory traversal forbidden.');
    }

    if (!fs.existsSync(normalizedFull)) {
      throw new Error('File not found.');
    }

    const stats = fs.statSync(normalizedFull);
    if (stats.isSymbolicLink()) {
      throw new Error('Reading from symbolic links is forbidden.');
    }

    let content = fs.readFileSync(normalizedFull, 'utf8');

    if (startLine !== undefined || endLine !== undefined) {
      const lines = content.split('\n');
      const start = startLine !== undefined ? Math.max(0, startLine - 1) : 0;
      const end = endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;
      content = lines.slice(start, end).join('\n');
    }

    return content;
  }

  listDirectory(dirPath?: string) {
    const workspaceRoot = getWorkspaceRoot();
    const targetDir = dirPath ? path.resolve(workspaceRoot, dirPath) : path.resolve(workspaceRoot);
    const normalizedRoot = path.resolve(workspaceRoot);
    const relative = path.relative(normalizedRoot, targetDir);

    if (relative.startsWith('..') && targetDir !== normalizedRoot) {
      throw new Error('Directory traversal forbidden.');
    }

    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      throw new Error('Directory not found.');
    }

    const files = fs.readdirSync(targetDir).map(name => {
      const fullPath = path.join(targetDir, name);
      try {
        const stats = fs.statSync(fullPath);
        return {
          name,
          isDir: stats.isDirectory(),
          size: stats.size
        };
      } catch {
        return {
          name,
          isDir: false,
          size: 0
        };
      }
    });

    return files;
  }
}
