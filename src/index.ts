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

app.get('/admin/metrics', (req, res) => {
  res.send(`<html>
  <body>
    <h1>Welcome, Chirpy Admin</h1>
    <p>Chirpy has been visited ${config.fileserverHits} times!</p>
  </body>
</html>`)
})

app.get('/admin/reset', (req, res) => {
  config.fileserverHits = 0
  res.type('text/plain; charset=utf-8').send(`<html>
  <body>
    <h1>Welcome, Chirpy Admin</h1>
    <p>Chirpy has been visited ${config.fileserverHits} times!</p>
  </body>
</html>`)
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
