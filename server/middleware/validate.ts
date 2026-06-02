import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
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

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // First sanitize inputs
      if (req.body) req.body = sanitizeData(req.body);
      if (req.query) req.query = sanitizeData(req.query);
      if (req.params) req.params = sanitizeData(req.params);

      // Validate req.body directly against the schema
      req.body = await schema.parseAsync(req.body);

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(error); // Pass to global error handler
      } else {
        next(error);
      }
    }
  };
};
