import express, { NextFunction, Request, Response } from 'express'
import { config } from './config.js'
import { createCipheriv } from 'crypto'

//Types
type Handler = (req: Request, res: Response) => void
type Middleware = (req: Request, res: Response, next: NextFunction) => void

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

function replaceBadWords(phrase: string): string {
  const bannedWords = ['kerfuffle', 'sharbert', 'fornax']
  const words = phrase.split(' ')
  const filteredWords = words.map(word =>
    bannedWords.includes(word.toLowerCase()) ? '****' : word
  )
  return filteredWords.join(' ')
}

const handleValidateChirp: Handler = (req, res) => {
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
        return res.status(400).json({ error: 'Chirp is too long' })
      }
      const cleanedBody = replaceBadWords(parsedBody.body)
      return res.status(200).json({ cleanedBody })
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' })
    }
  })
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

//Global Middlewares
app.use(middlewareLogResponses)
app.use('/app', middlewareMetricsInc)
app.use('/app', express.static('./src/app'))

//Routes
app.get('/api/healthz', handleHealthz)

app.get('/admin/metrics', handleMetrics)

app.post('/admin/reset', handleReset)

app.post('/api/validate_chirp', handleValidateChirp)

//Server Listening
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}/app/`)
})
