import bcrypt from 'bcrypt'
import jwt, { JwtPayload } from 'jsonwebtoken'

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
