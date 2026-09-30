import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    // Kept at the project root rather than under prisma/ so that deployment
    // platforms which look for a top-level migrations/ directory can find it.
    path: 'migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
})