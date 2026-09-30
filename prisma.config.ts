import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

// Prisma 8 no longer reads .env on its own once a config file is present, so
// DATABASE_URL would be undefined here. Node's built-in loader handles it
// without adding a dotenv dependency. Guarded so it is a no-op in production,
// where the platform supplies the environment instead.
if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

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