import { Router } from 'express';

export const fastifyProxyRouter = Router();

const FASTIFY_PORT = parseInt(process.env.FASTIFY_PORT || '3001', 10);

fastifyProxyRouter.all('/*', async (req, res) => {
  const targetUrl = `http://127.0.0.1:${FASTIFY_PORT}${req.url}`;
  try {
    const headers: Record<string, string> = {};
    Object.entries(req.headers).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== 'content-length' && lowerKey !== 'host' && lowerKey !== 'connection') {
        headers[key] = Array.isArray(value) ? value.join(', ') : (value || '');
      }
    });

    // Ensure we have a valid JSON body for non-GET/HEAD requests
    let requestBody: undefined | string = undefined;
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (req.body === undefined) {
        res.status(400).send({ error: 'JSON body required' });
        return;
      }
      requestBody = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: requestBody
    });
    
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });
    res.status(response.status);
    res.flushHeaders();
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (e: any) {
    console.error('[Fastify Proxy Error]:', e.message);
    res.status(500).send({ error: `Fastify Proxy Error: ${e.message}` });
  }
});
