import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // DIRECT_DATABASE_URL bypasses a connection pooler when one is in front of
    // the database; locally the two are the same.
    url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'],
  },
})
