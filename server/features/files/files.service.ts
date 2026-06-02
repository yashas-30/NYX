import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import logger from '../../lib/logger.ts';

const UPLOADS_DIR = path.join(process.cwd(), '.nyx-uploads');

export class FilesService {
  constructor() {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  }

  async saveFile(name: string, mimeType: string, base64Data: string): Promise<string> {
    const id = crypto.randomUUID();
    const safeName = name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = path.join(UPLOADS_DIR, `${id}-${safeName}`);

    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);
    logger.info({ filePath }, 'Saved uploaded file');

    return filePath;
  }
}
