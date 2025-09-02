process.loadEnvFile()

type APIConfig = {
  fileserverHits: number
  dbURL: string
}

export const config: APIConfig = {
  fileserverHits: 0,
  dbURL: process.env.DB_URL!,
}
