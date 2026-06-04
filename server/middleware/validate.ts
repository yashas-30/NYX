import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodObject, ZodError } from 'zod';
import sanitizeHtml from 'sanitize-html';

// Recursively sanitize strings in objects
export const sanitizeData = (data: any): any => {
  if (typeof data === 'string') {
    return sanitizeHtml(data.trim(), {
      allowedTags: [], // strip all tags
      allowedAttributes: {},
    });
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }
  if (data !== null && typeof data === 'object') {
    const sanitizedObj: any = {};
    for (const [key, value] of Object.entries(data)) {
      sanitizedObj[key] = sanitizeData(value);
    }
    return sanitizedObj;
  }
  return data;
};

export const validate = (schema: ZodObject<any>) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // First sanitize inputs
    if (request.body) request.body = sanitizeData(request.body);
    if (request.query) request.query = sanitizeData(request.query);
    if (request.params) request.params = sanitizeData(request.params);

    // Validate req.body directly against the schema
    request.body = await schema.parseAsync(request.body);
  };
};
