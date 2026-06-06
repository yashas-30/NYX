import helmet from 'helmet';
import { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

export async function setupSecurity(fastify: FastifyInstance) {
  // Add Helmet for secure headers
  // Using fastify-helmet under the hood typically, but abstracting it
  // fastify.register(helmet);

  // Rate Limiting
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });

  // PII Redaction
  fastify.decorate('redactPII', (text: string) => {
    return text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED-EMAIL]')
               .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[REDACTED-PHONE]');
  });
}
