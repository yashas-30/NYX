import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import swaggerUi from 'swagger-ui-express';
import { Application, Request, Response } from 'express';

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

export function setupOpenApi(app: Application) {
  app.get('/api/v1/docs/swagger.json', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(generateOpenApiDocument());
  });

  app.use('/api/v1/docs', swaggerUi.serve, (req: Request, res: Response, next) => {
    const swaggerDoc = generateOpenApiDocument();
    swaggerUi.setup(swaggerDoc)(req, res, next);
  });
}
