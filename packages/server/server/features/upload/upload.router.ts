import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(_dirname, '../../../../uploads');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv',
  'application/xml',
  'text/html',
  'text/css',
  'application/javascript',
  'text/typescript',
  'application/typescript',
  'application/zip',
  'application/gzip',
  'application/x-tar',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.pdf', '.txt', '.md', '.json', '.csv', '.xml',
  '.html', '.css', '.js', '.jsx', '.ts', '.tsx',
  '.py', '.rs', '.go', '.rb', '.php', '.java', '.kt', '.swift',
  '.yaml', '.yml', '.toml',
  '.sh', '.bash', '.zsh', '.ps1',
  '.zip', '.gz', '.tar', '.tgz',
  '.log',
]);

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '_')
    .replace(/\0/g, '');
}

export async function uploadRouter(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(data.mimetype)) {
      return reply.code(415).send({
        error: `Unsupported file type: ${data.mimetype}`,
      });
    }

    const ext = path.extname(data.filename).toLowerCase();

    // Validate file extension
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return reply.code(415).send({
        error: `Unsupported file extension: ${ext}`,
      });
    }

    // Reject MIME / extension mismatch (e.g. .exe served as application/pdf)
    const extMimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.xml': 'application/xml',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.jsx': 'application/javascript',
      '.ts': 'text/typescript',
      '.tsx': 'text/typescript',
      '.yaml': 'application/x-yaml',
      '.yml': 'application/x-yaml',
      '.toml': 'application/toml',
    };
    const expectedMime = extMimeMap[ext];
    if (expectedMime && data.mimetype !== expectedMime) {
      return reply.code(415).send({
        error: `File extension .${ext} does not match MIME type ${data.mimetype}`,
      });
    }

    // Sanitize and generate unique filename
    const safeBasename = sanitizeFilename(path.basename(data.filename, ext));
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const newFilename = `${safeBasename}-${uniqueSuffix}${ext}`;
    const filepath = path.join(UPLOADS_DIR, newFilename);

    await pipeline(data.file, fs.createWriteStream(filepath));

    return reply.send({
      message: 'File uploaded successfully',
      filename: newFilename,
      path: `/uploads/${newFilename}`,
    });
  });
}
