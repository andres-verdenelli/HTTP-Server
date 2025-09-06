import express, { NextFunction, Request, Response } from 'express'
import { config } from './config.js'
import postgres from 'postgres'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import {
  createUser,
  deleteAllUsers,
  getUserByEmail,
} from './db/queries/users.js'
import { createChirp, getAllChirps, getChirp } from './db/queries/chirps.js'
import { checkPasswordHash, hashPassword } from './auth.js'

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
    <p>Chirpy has been visited ${config.fileserverHits} times!</p>
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
  try {
    if (!req.is('application/json')) {
      return res.status(400).json({ error: 'Invalid Content-Type' })
    }

    const rawBody = req.body?.body
    const userId = req.body?.userId

    if (typeof rawBody !== 'string' || typeof userId !== 'string') {
      return res
        .status(400)
        .json({ error: 'Invalid or missing "body" or "userId"' })
    }

    if (rawBody.length > 140) {
      throw new BadRequestError('Chirp is too long. Max length is 140')
    }

    const cleanedBody = replaceBadWords(rawBody)

    const newChirp = await createChirp({ body: cleanedBody, userId })

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
    if (!req.is('application/json')) {
      throw new BadRequestError('Invalid Content-Type')
    }
    const email = req.body?.email
    const password = req.body?.password
    if (typeof email !== 'string') {
      return res.status(400).json({ error: 'Missing email' })
    }
    if (typeof password !== 'string') {
      return res.status(400).json({ error: 'Missing password' })
    }
    const hashedPassword = await hashPassword(password)
    const createdUser = await createUser({ email, hashedPassword })
    const { hashedPassword: _hp, ...safeUser } = createdUser
    return res.status(201).json(safeUser)
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
  console.error(err)
  if (err instanceof BadRequestError) {
    return res.status(400).json({ error: err.message })
  }
  res.status(500).json({
    error: 'Something went wrong on our end',
  })
}

const handleGetAllChirps: Middleware = async (req, res, next) => {
  try {
    const chirps = await getAllChirps()
    return res.status(200).json(chirps)
  } catch (error) {
    return next(error)
  }
}

const handleGetChirp: Middleware = async (req, res, next) => {
  try {
    const chirpId = req.params.chirpId
    const chirp = await getChirp(chirpId)
    if (!chirp) {
      return res.status(404).json({ error: 'Chirp not found' })
    }
    return res.status(200).json(chirp)
  } catch (error) {
    return next(error)
  }
}

const handleLogin: Middleware = async (req, res, next) => {
  try {
    if (!req.is('application/json')) {
      return res.status(400).json({ error: 'Invalid Content-Type' })
    }
    const email = req.body?.email
    const password = req.body?.password
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res
        .status(400)
        .json({ error: 'Invalid or missing "email" or "password"' })
    }
    const user = await getUserByEmail(email)
    if (!user) {
      return res.status(401).json({ error: 'Incorrect email or password' })
    }
    const passwordMatch = await checkPasswordHash(
      password,
      user?.hashedPassword
    )
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Incorrect email or password' })
    }
    const { hashedPassword, ...userWithoutPassword } = user
    return res.status(200).json(userWithoutPassword)
  } catch (error) {
    return next(error)
  }
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

app.get('/api/chirps', handleGetAllChirps)

app.get('/api/chirps/:chirpId', handleGetChirp)

app.post('/api/login', express.json(), handleLogin)

//Error Handle Middleware
app.use(errorHandler)

//Server Listening
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}/app/`)
})
