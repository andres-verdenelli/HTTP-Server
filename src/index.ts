import express, { NextFunction, Request, Response } from 'express'
import { config } from './config.js'
import postgres from 'postgres'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import {
  createUser,
  deleteAllUsers,
  getUserByEmail,
  getUserFromRefreshToken,
} from './db/queries/users.js'
import { createChirp, getAllChirps, getChirp } from './db/queries/chirps.js'
import {
  checkPasswordHash,
  getBearerToken,
  hashPassword,
  makeJWT,
  makeRefreshToken,
  validateJWT,
} from './auth.js'
import {
  createRefreshToken,
  revokeRefreshToken,
} from './db/queries/refreshToken.js'

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
    if (typeof rawBody !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing "body"' })
    }

    let userId: string
    try {
      const token = getBearerToken(req)
      userId = validateJWT(token, config.secret)
    } catch {
      return res.status(401).json({ error: 'Invalid or missing token' })
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
    // let expiresInSeconds = req.body?.expiresInSeconds

    // if (
    //   expiresInSeconds !== undefined &&
    //   (typeof expiresInSeconds !== 'number' ||
    //     !Number.isFinite(expiresInSeconds) ||
    //     expiresInSeconds <= 0)
    // ) {
    //   return res
    //     .status(400)
    //     .json({ error: 'expiresInSeconds must be a positive number' })
    // }

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

    // if (expiresInSeconds === undefined) {
    //   expiresInSeconds = 3600
    // }

    // expiresInSeconds = Math.min(3600, expiresInSeconds)
    // expiresInSeconds = Math.max(1, expiresInSeconds)

    const jwt = makeJWT(user.id, 3600, config.secret)
    const { hashedPassword, ...userWithoutPassword } = user

    const refreshToken = makeRefreshToken()
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // 60 días

    await createRefreshToken({
      token: refreshToken,
      expiresAt: expiresAt,
      userId: userWithoutPassword.id,
    })

    return res
      .status(200)
      .json({ ...userWithoutPassword, token: jwt, refreshToken: refreshToken })
  } catch (error) {
    return next(error)
  }
}

const handleRefresh: Middleware = async (req, res, next) => {
  try {
    let token: string
    try {
      token = getBearerToken(req) // este es el refresh token
    } catch {
      return res
        .status(401)
        .json({ error: 'Missing or invalid Authorization header' })
    }

    const user = await getUserFromRefreshToken(token)
    if (!user) {
      return res
        .status(401)
        .json({ error: 'Invalid, expired, or revoked refresh token' })
    }

    const newAccessToken = makeJWT(user.id, 3600, config.secret)
    return res.status(200).json({ token: newAccessToken })
  } catch (err) {
    return next(err)
  }
}

const handleRevoke: Middleware = async (req, res, next) => {
  try {
    let token: string
    try {
      token = getBearerToken(req) // refresh token en Authorization
    } catch {
      return res
        .status(401)
        .json({ error: 'Missing or invalid Authorization header' })
    }

    await revokeRefreshToken(token)
    return res.status(204).send()
  } catch (err) {
    return next(err)
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

app.post('/api/refresh', handleRefresh)

app.post('/api/revoke', handleRevoke)

//Error Handle Middleware
app.use(errorHandler)

//Server Listening
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}/app/`)
})
