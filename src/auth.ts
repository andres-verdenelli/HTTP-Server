import bcrypt from 'bcrypt'
import { Request } from 'express'
import jwt, { JwtPayload } from 'jsonwebtoken'
import crypto from 'node:crypto'

type Payload = Pick<JwtPayload, 'iss' | 'sub' | 'iat' | 'exp'>

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
  userID: string,
  expiresIn: number,
  secret: string
): string {
  const timeNow = Math.floor(Date.now() / 1000)
  const payload: Payload = {
    iss: 'chirpy',
    sub: userID,
    iat: timeNow,
    exp: timeNow + expiresIn,
  }
  return jwt.sign(payload, secret)
}

export function validateJWT(tokenString: string, secret: string): string {
  try {
    const decoded = jwt.verify(tokenString, secret)
    if (typeof decoded === 'string') {
      throw new Error('el token es un string')
    }
    if (!decoded.sub || typeof decoded.sub !== 'string') {
      throw new Error('No existe sub dentro del token o no es un string')
    }
    return decoded.sub
  } catch (error) {
    throw new Error('Error validating token')
  }
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
