import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './server/db/schema.sqlite.ts',
  out: './server/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './nyx.db',
  },
});
