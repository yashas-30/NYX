import { FastifyInstance } from 'fastify';
import mercurius from 'mercurius';
import { buildSchema } from 'graphql';

export async function graphqlRouter(fastify: FastifyInstance) {
  // Boilerplate GraphQL schema
  const schema = `
  type Query {
    hello: String
    conversations: [Conversation]
  }

  type Conversation {
    id: String
    title: String
  }
`;

  const resolvers = {
    Query: {
      hello: () => {
        return 'Hello from NYX GraphQL!';
      },
      conversations: () => {
        // Boilerplate resolver, would connect to conversation.service
        return [{ id: '1', title: 'Example Conversation' }];
      },
    },
  };

  fastify.register(mercurius, {
    schema,
    resolvers,
    graphiql: true, // Enable GraphiQL UI
  });
}
