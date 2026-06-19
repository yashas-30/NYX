import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(_dirname, '../../../../uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export const uploadRouter: FastifyPluginAsync = async (app: FastifyInstance) => {

{
// Wrapping block to avoid scope issues, typically you can remove the wrapper entirely
const router = uploadRouter;
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await (request as any).file();
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

};
