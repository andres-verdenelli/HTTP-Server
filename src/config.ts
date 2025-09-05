process.loadEnvFile()

import type { MigrationConfig } from 'drizzle-orm/migrator'

type APIConfig = {
  fileserverHits: number
  db: DBConfig
  platform: string
}

type DBConfig = {
  url: string
  migrationConfig: MigrationConfig
}

export const config: APIConfig = {
  fileserverHits: 0,
  db: {
    url: process.env.DB_URL!,
    migrationConfig: {
      migrationsFolder: './drizzle',
    },
  },
  platform: process.env.PLATFORM!,
}
