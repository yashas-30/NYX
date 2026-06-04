export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: any) {
    super(400, message, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Not authenticated', details?: any) {
    super(401, message, 'AUTHENTICATION_ERROR', details);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Not authorized', details?: any) {
    super(403, message, 'AUTHORIZATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: any) {
    super(404, message, 'NOT_FOUND', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', details?: any) {
    super(429, message, 'RATE_LIMIT_EXCEEDED', details);
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error', details?: any) {
    super(500, message, 'INTERNAL_ERROR', details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', details?: any) {
    super(503, message, 'SERVICE_UNAVAILABLE', details);
  }
}
