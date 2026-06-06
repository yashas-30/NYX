import request from 'supertest';
import { buildFastifyServer } from '../../apps/server/server/lib/fastifyConfig.js';
import { FastifyInstance } from 'fastify';

describe('API Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildFastifyServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  test('POST /api/gemini/stream returns SSE', async () => {
    const response = await request(app.server)
      .post('/api/gemini/stream')
      .send({ model: 'gemini-3.5-flash', prompt: 'Hello' })
      .set('Accept', 'text/event-stream');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
  });

  test('POST /api/terminal/run executes command', async () => {
    const response = await request(app.server)
      .post('/api/terminal/run')
      .send({ command: 'echo "hello"' });

    expect(response.status).toBe(200);
    expect(response.body.stdout).toContain('hello');
  });

  test('POST /api/nyx/write-file creates file', async () => {
    const response = await request(app.server)
      .post('/api/nyx/write-file')
      .send({ filePath: 'test.txt', content: 'Hello World' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
