import express, { NextFunction, Request, Response } from 'express'
import { config } from './config.js'

const app = express()
const PORT = 8080

app.use(middlewareLogResponses)
app.use('/app', middlewareMetricsInc)
app.use('/app', express.static('./src/app'))

app.get('/api/healthz', (req, res) => {
  res.status(200).type('text/plain; charset=utf-8').send('OK')
})

app.get('/api/metrics', (req, res) => {
  res.send(`Hits: ${config.fileserverHits}`)
})

app.get('/api/reset', (req, res) => {
  config.fileserverHits = 0
  res.send(`Hits: ${config.fileserverHits}`)
})

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}/app/`)
})

function middlewareLogResponses(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      console.log(
        `[NON-OK] ${req.method} ${req.originalUrl} - Status: ${res.statusCode}`
      )
    }
  })
  next()
}

function middlewareMetricsInc(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  config.fileserverHits++
  next()
}
