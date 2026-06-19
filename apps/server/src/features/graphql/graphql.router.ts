import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

export const graphqlRouter: FastifyPluginAsync = async (app: FastifyInstance) => {

// GraphQL via mercurius (Fastify-only) has been removed during Express migration.
// Stub returns 501 until a proper express-compatible GraphQL layer is added.
app.all('/graphql', async (request: FastifyRequest, reply: FastifyReply) => {
  reply.code(501).send({ error: 'GraphQL endpoint not yet available in Express mode.' });
});

};
