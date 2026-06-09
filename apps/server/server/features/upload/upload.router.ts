import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { UPLOADS_DIR } from '../../lib/paths.js';

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export async function uploadRouter(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(data.filename);
    const basename = path.basename(data.filename, ext);
    const newFilename = `${basename}-${uniqueSuffix}${ext}`;
    const filepath = path.join(UPLOADS_DIR, newFilename);

    await pipeline(data.file, fs.createWriteStream(filepath));

    return reply.send({
      message: 'File uploaded successfully',
      filename: newFilename,
      path: `/uploads/${newFilename}`,
      // size might not be available accurately until streaming is complete, but it's optional
    });
  });
}
