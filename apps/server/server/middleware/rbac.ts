import { FastifyRequest, FastifyReply } from 'fastify';

export enum Role {
  ADMIN = 'admin',
  DEVELOPER = 'developer',
  VIEWER = 'viewer'
}

export const PERMISSIONS = {
  [Role.ADMIN]: ['*'],
  [Role.DEVELOPER]: [
    'chat:use', 'models:use', 'terminal:execute', 
    'files:write', 'files:read', 'settings:personal'
  ],
  [Role.VIEWER]: [
    'chat:use', 'models:use', 'files:read', 'settings:personal'
  ]
};

export const requirePermission = (requiredPermission: string) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Mock user retrieval
    const userRole = (request.headers['x-user-role'] as Role) || Role.VIEWER;
    const userPermissions = PERMISSIONS[userRole];

    if (!userPermissions.includes('*') && !userPermissions.includes(requiredPermission)) {
      reply.status(403).send({ error: 'Forbidden: Insufficient permissions' });
      throw new Error('Forbidden');
    }
  };
};
