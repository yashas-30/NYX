import { Router } from 'express';
import { graphqlHTTP } from 'express-graphql';
import { buildSchema } from 'graphql';

export const graphqlRouter = Router();

// Boilerplate GraphQL schema
const schema = buildSchema(`
  type Query {
    hello: String
    conversations: [Conversation]
  }

  type Conversation {
    id: String
    title: String
  }
`);

const root = {
  hello: () => {
    return 'Hello from NYX GraphQL!';
  },
  conversations: () => {
    // Boilerplate resolver, would connect to conversation.service
    return [{ id: '1', title: 'Example Conversation' }];
  },
};

graphqlRouter.use(
  '/',
  graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true, // Enable GraphiQL UI
  })
);
