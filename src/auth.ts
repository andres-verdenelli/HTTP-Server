import bcrypt from 'bcrypt'
import { Request } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10)
}

export async function checkPasswordHash(
  password: string,
  hash: string
): Promise<boolean> {
  return await bcrypt.compare(password, hash)
}

export function makeJWT(
  userId: string,
  expiresIn: number,
  secret: string
): string {
  return jwt.sign({}, secret, {
    algorithm: 'HS256',
    issuer: 'chirpy',
    subject: userId,
    expiresIn,
  })
}

export function validateJWT(tokenString: string, secret: string): string {
  const decoded = jwt.verify(tokenString, secret)

  if (typeof decoded === 'string') {
    throw new Error('Token payload is a string')
  }
  if (!decoded.sub || typeof decoded.sub !== 'string') {
    throw new Error('Missing or invalid "sub" in token')
  }
  return decoded.sub
}

export function getBearerToken(req: Request): string {
  let authorization = req.get('authorization')

  if (typeof authorization !== 'string') {
    throw new Error('authorization is not a string or missing')
  }

  if (!authorization.startsWith('Bearer ')) {
    throw new Error('invalid auth header')
  }

  return authorization.slice(7)
}

export function makeRefreshToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function getAPIKey(req: Request): string {
  let authorization = req.get('authorization')

  if (typeof authorization !== 'string') {
    throw new Error('authorizaton is not a string or missing')
  }
  if (!authorization.startsWith('ApiKey ')) {
    throw new Error('invalid auth header')
  }

  return authorization.slice(7).trim()
}
