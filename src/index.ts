import express, { NextFunction, Request, Response } from 'express'
import { config } from './config.js'

//Types
type Handler = (req: Request, res: Response) => void
type Middleware = (req: Request, res: Response, next: NextFunction) => void

//Classes
class BadRequestError extends Error {
  constructor(message: string) {
    super(message)
  }
}

//Constants
const app = express()
const PORT = 8080

//Handlers
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

const handleReset: Handler = (_req, res) => {
  config.fileserverHits = 0
  res.sendStatus(200)
}

const handleValidateChirp: Middleware = (req, res, next) => {
  let raw = ''
  req.setEncoding('utf8')

  req.on('data', chunk => {
    raw += chunk
  })

  req.on('end', () => {
    try {
      let parsedBody = JSON.parse(raw)
      if (!parsedBody.body || typeof parsedBody.body !== 'string') {
        return res.status(400).json({ error: 'Invalid or missing "body"' })
      }
      if (parsedBody.body.length > 140) {
        throw new BadRequestError('Chirp is too long. Max length is 140')
      }
      const cleanedBody = replaceBadWords(parsedBody.body)
      return res.status(200).json({ cleanedBody })
    } catch (err) {
      return next(err)
    }
  })
}

function replaceBadWords(phrase: string): string {
  const bannedWords = ['kerfuffle', 'sharbert', 'fornax']
  const words = phrase.split(' ')
  const filteredWords = words.map(word =>
    bannedWords.includes(word.toLowerCase()) ? '****' : word
  )
  return filteredWords.join(' ')
}

//MiddleWares
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

app.post('/api/validate_chirp', handleValidateChirp)

//Error Handle Middleware
app.use(errorHandler)

//Server Listening
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}/app/`)
})
