import logger from '../../lib/logger.ts';
import fs from 'fs';
import path from 'path';
import { getWorkspaceRoot } from '../../lib/paths.ts';
import { db } from '../../db/client.ts';
import { userPreferences, pendingFileWrites } from '../../db/schema.ts';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { minimatch } from 'minimatch';
import { AuditLog } from '../../lib/auditLog.ts';

export class FilesystemService {
  private getNyxIgnorePatterns(): string[] {
    const workspaceRoot = getWorkspaceRoot();
    const ignorePath = path.join(workspaceRoot, '.nyxignore');
    const patterns = ['node_modules/**', '.env', '.git/**', 'dist/**', '*.key', '*.pem'];
    if (fs.existsSync(ignorePath)) {
      try {
        const content = fs.readFileSync(ignorePath, 'utf8');
        const customPatterns = content
          .split('\n')
          .map((p) => p.trim())
          .filter((p) => p.length > 0 && !p.startsWith('#'));
        patterns.push(...customPatterns);
      } catch (err) {
        logger.error('[Filesystem] Failed to read .nyxignore:', err);
      }
    }
    return patterns;
  }

  private isNyxIgnored(filePath: string): boolean {
    const patterns = this.getNyxIgnorePatterns();
    for (const pattern of patterns) {
      if (minimatch(filePath, pattern, { dot: true, matchBase: true })) {
        return true;
      }
    }
    return false;
  }

  async writeFile(filePath: string, content: string, overwrite?: boolean, agentRunId?: string) {
    const workspaceRoot = getWorkspaceRoot();

    // Normalize both paths for case-insensitive Windows comparison
    const normalizedFull = path.resolve(workspaceRoot, filePath);
    const normalizedRoot = path.resolve(workspaceRoot);
    const relative = path.relative(normalizedRoot, normalizedFull);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Directory traversal forbidden.');
    }
    const fullPath = normalizedFull;

    // Check nyxignore (using relative path with forward slashes for minimatch)
    const posixRelative = relative.split(path.sep).join('/');
    if (this.isNyxIgnored(posixRelative)) {
      await AuditLog.log({
        category: 'file_write_attempt',
        event: { path: filePath, error: 'Blocked by .nyxignore' },
        status: 'blocked',
        agentRunId,
      });
      throw new Error(`File access forbidden by .nyxignore: ${filePath}`);
    }

    // Symlink protection
    if (fs.existsSync(fullPath)) {
      const lstat = fs.lstatSync(fullPath);
      if (lstat.isSymbolicLink()) {
        throw new Error('Writing to symbolic links is forbidden.');
      }
    }

    // Extension whitelist
    const ALLOWED_EXTENSIONS = new Set([
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.json',
      '.css',
      '.html',
      '.py',
      '.md',
      '.yml',
      '.yaml',
      '.sh',
      '.txt',
      '.env',
    ]);
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
          path: filePath,
        };
      }
    }

    // Check auto-approve setting
    let autoApprove = false;
    try {
      const pref = await db
        .select()
        .from(userPreferences)
        .where(
          and(
            eq(userPreferences.userId, 'default'),
            eq(userPreferences.key, 'auto_approve_file_writes')
          )
        )
        .get();
      if (pref && pref.value === 'true') {
        autoApprove = true;
      }
    } catch (err) {
      logger.error('[Filesystem] Failed to query user preferences for auto-approve', err);
    }

    if (!autoApprove && agentRunId) {
      // Queue the file write
      try {
        const id = crypto.randomUUID();
        await db.insert(pendingFileWrites).values({
          id,
          agentRunId,
          filePath: posixRelative,
          content,
          status: 'pending',
          createdAt: Date.now(),
        });

        await AuditLog.log({
          category: 'file_write_attempt',
          event: { path: filePath, message: 'Queued for review' },
          status: 'success',
          agentRunId,
        });

        return { queued: true, path: filePath, id };
      } catch (err: any) {
        throw new Error(`Failed to queue file write: ${err.message}`);
      }
    }

    // Direct write (Auto-approved or manual)
    if (fs.existsSync(fullPath)) {
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
        logger.warn(
          `[Backup System] Failed to create backup, proceeding anyway:`,
          backupErr.message
        );
      }
    }

    // Ensure target folder exists
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

    // Write file
    await fs.promises.writeFile(fullPath, content, 'utf8');
    logger.info(`[File System] Successfully wrote file to: ${fullPath}`);

    await AuditLog.log({
      category: 'file_write_attempt',
      event: { path: filePath, autoApproved: autoApprove },
      status: 'success',
      agentRunId,
    });

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

    const posixRelative = relative.split(path.sep).join('/');
    if (this.isNyxIgnored(posixRelative)) {
      throw new Error(`File access forbidden by .nyxignore: ${filePath}`);
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

    const files = fs
      .readdirSync(targetDir)
      .map((name) => {
        const fullPath = path.join(targetDir, name);
        const relPath = path.relative(normalizedRoot, fullPath);
        const posixRelative = relPath.split(path.sep).join('/');

        // Do not return ignored files
        if (this.isNyxIgnored(posixRelative)) {
          return null;
        }

        try {
          const stats = fs.statSync(fullPath);
          return {
            name,
            isDir: stats.isDirectory(),
            size: stats.size,
          };
        } catch {
          return {
            name,
            isDir: false,
            size: 0,
          };
        }
      })
      .filter(Boolean); // Remove nulls

    return files;
  }
}
