import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  redact: {
    paths: ['req.headers.authorization', 'req.body.apiKey', 'req.body.password'],
    remove: true
  }
});

// Request logger middleware
import pinoHttp from 'pino-http';
export const requestLogger = pinoHttp({ logger });
