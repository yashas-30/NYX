// @ts-nocheck
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { FastifyInstance } from 'fastify';

export const registry = new OpenAPIRegistry();

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'NYX Local API',
      description: 'API for NYX Local Agentic Coding Assistant',
    },
    servers: [{ url: '/api/v1' }],
  });
}

export async function setupOpenApi(app: FastifyInstance) {
  await app.register(fastifySwagger, {
    mode: 'static',
    specification: {
      document: generateOpenApiDocument() as any,
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/api/v1/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  app.get('/api/v1/docs/swagger.json', async (request, reply) => {
    reply.header('Content-Type', 'application/json');
    return generateOpenApiDocument();
  });
}
