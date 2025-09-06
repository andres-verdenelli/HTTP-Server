import express, { NextFunction, Request, Response } from 'express'
import { config } from './config.js'
import postgres from 'postgres'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import { createUser, deleteAllUsers } from './db/queries/users.js'
import { createChirp } from './db/queries/chirps.js'

//Types
type Handler = (req: Request, res: Response) => void
type Middleware = (req: Request, res: Response, next: NextFunction) => void

//Classes
class BadRequestError extends Error {
  constructor(message: string) {
    super(message)
  }
}

//Automitic Migrations
const migrationClient = postgres(config.db.url, { max: 1 })
await migrate(drizzle(migrationClient), config.db.migrationConfig)
await migrationClient.end()

//Constants
const app = express()
const PORT = 8080

//Handlers and Middlewares
const handleHealthz: Handler = (_req, res) => {
  res.status(200).type('text/plain; charset=utf-8').send('OK')
}

const handleMetrics: Handler = (_req, res) => {
  res.send(`<html>
  <body>
    <h1>Welcome, Chirpy Admin</h1>
    <p>Chir˝py has been visited ${config.fileserverHits} times!</p>
  </body>
</html>`)
}

const handleReset: Middleware = async (_req, res, next) => {
  try {
    if (config.platform !== 'dev') {
      return res.status(403).send()
    }
    await deleteAllUsers()
    config.fileserverHits = 0
    return res.status(200).json({ ok: true })
  } catch (error) {
    next(error)
  }
}

const handleValidateChirp: Middleware = async (req, res, next) => {
  //falta mejorar validacion
  // si es 'application/json
  // extraer el body.body y sacarle las palabras malas
  // extraer el id
  // crear un nuevo objeto new chirp
  try {
    const body = replaceBadWords(req.body.body)
    if (typeof body !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing "body"' })
    }
    if (body.length > 140) {
      throw new BadRequestError('Chirp is too long. Max length is 140')
    }
    const newChirp = await createChirp(req.body)
    return res.status(201).json(newChirp)
  } catch (error) {
    return next(error)
  }
}

function replaceBadWords(phrase: string): string {
  const bannedWords = ['kerfuffle', 'sharbert', 'fornax']
  const words = phrase.split(' ')
  const filteredWords = words.map(word =>
    bannedWords.includes(word.toLowerCase()) ? '****' : word
  )
  return filteredWords.join(' ')
}

const handleCreateUser: Middleware = async (req, res, next) => {
  try {
    if (!req.is('application/json') || typeof req.body?.email !== 'string') {
      throw new BadRequestError('Invalid JSON or missing "email"')
    }
    const email = req.body.email
    const createdUser = await createUser({ email })
    return res.status(201).json(createdUser)
  } catch (error) {
    return next(error)
  }
}

const middlewareLogResponses: Middleware = (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      console.log(
        `[NON-OK] ${req.method} ${req.originalUrl} - Status: ${res.statusCode}`
      )
    }
  })
  next()
}

const middlewareMetricsInc: Middleware = (_req, _res, next) => {
  config.fileserverHits++
  next()
}

function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.log(err)
  if (err instanceof BadRequestError) {
    return res.status(400).json({ error: err.message })
  }
  res.status(500).json({
    error: 'Something went wrong on our end',
  })
}

//Global Middlewares
app.use(middlewareLogResponses)
app.use('/app', middlewareMetricsInc)
app.use('/app', express.static('./src/app'))

//Routes
app.get('/api/healthz', handleHealthz)

app.get('/admin/metrics', handleMetrics)

app.post('/admin/reset', handleReset)

app.post('/api/chirps', express.json(), handleValidateChirp)

app.post('/api/users', express.json(), handleCreateUser)

//Error Handle Middleware
app.use(errorHandler)

//Server Listening
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}/app/`)
})
