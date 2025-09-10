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

//Error Classes
class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

class BadRequest extends HttpError {
  constructor(message = 'Bad Request', code = 'BAD_REQUEST') {
    super(400, message, code)
  }
}
class Unauthorized extends HttpError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    super(401, message, code)
  }
}
class NotFound extends HttpError {
  constructor(message = 'Not Found', code = 'NOT_FOUND') {
    super(404, message, code)
  }
}
class UnsupportedMediaType extends HttpError {
  constructor(
    message = 'Unsupported Media Type',
    code = 'UNSUPPORTED_MEDIA_TYPE'
  ) {
    super(415, message, code)
  }
}
class Forbidden extends HttpError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN') {
    super(403, message, code)
  }
}

type AsyncMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any> | any

const asyncHandler =
  (fn: AsyncMiddleware): AsyncMiddleware =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next)

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
  if (config.platform !== 'dev') {
    return res.status(403).send()
  }
  await deleteAllUsers()
  config.fileserverHits = 0
  return res.status(200).json({ ok: true })
}

const handleValidateChirp: Middleware = async (req, res, next) => {
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
    throw new BadRequest('Chirp is too long. Max length is 140')
  }

  const cleanedBody = replaceBadWords(rawBody)

  const newChirp = await createChirp({ body: cleanedBody, userId })

  return res.status(201).json(newChirp)
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
  if (!req.is('application/json')) {
    throw new BadRequest('Invalid Content-Type')
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
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(err)
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code })
  }
  return res
    .status(500)
    .json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' })
}

const handleGetAllChirps: Middleware = async (req, res, next) => {
  const chirps = await getAllChirps()
  return res.status(200).json(chirps)
}

const handleGetChirp: Middleware = async (req, res, next) => {
  const chirpId = req.params.chirpId
  const chirp = await getChirp(chirpId)
  if (!chirp) {
    return res.status(404).json({ error: 'Chirp not found' })
  }
  return res.status(200).json(chirp)
}

const handleLogin: Middleware = async (req, res, next) => {
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

  const passwordMatch = await checkPasswordHash(password, user?.hashedPassword)

  if (!passwordMatch) {
    return res.status(401).json({ error: 'Incorrect email or password' })
  }

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
}

const handleRefresh: Middleware = async (req, res, next) => {
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
}

const handleRevoke: Middleware = async (req, res, next) => {
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
}

//Global Middlewares
app.use(middlewareLogResponses)
app.use('/app', middlewareMetricsInc)
app.use('/app', express.static('./src/app'))

//Routes
app.get('/api/healthz', handleHealthz)

app.get('/admin/metrics', handleMetrics)

app.post('/admin/reset', asyncHandler(handleReset))

app.post('/api/chirps', express.json(), asyncHandler(handleValidateChirp))

app.post('/api/users', express.json(), asyncHandler(handleCreateUser))

app.get('/api/chirps', asyncHandler(handleGetAllChirps))

app.get('/api/chirps/:chirpId', asyncHandler(handleGetChirp))

app.post('/api/login', express.json(), asyncHandler(handleLogin))

app.post('/api/refresh', asyncHandler(handleRefresh))

app.post('/api/revoke', asyncHandler(handleRevoke))

//Error Handle Middleware
app.use(errorHandler)

//Server Listening
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}/app/`)
})
