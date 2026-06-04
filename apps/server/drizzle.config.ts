import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './server/db/schema.js',
  out: './server/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './nyx.db',
  },
});
