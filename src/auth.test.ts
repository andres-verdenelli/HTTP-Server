import { describe, it, expect, beforeAll } from 'vitest'
import {
  checkPasswordHash,
  hashPassword,
  makeJWT,
  validateJWT,
} from './auth.js'

describe('Password Hashing', () => {
  const password1 = 'correctPassword123!'
  const password2 = 'anotherPassword456!'
  let hash1: string
  let hash2: string

  beforeAll(async () => {
    hash1 = await hashPassword(password1)
    hash2 = await hashPassword(password2)
  })

  it('should return true for the correct password', async () => {
    const result = await checkPasswordHash(password1, hash1)
    expect(result).toBe(true)
  })

  it('should return false for the wrong password', async () => {
    const result = await checkPasswordHash(password1, 'test')
    expect(result).toBe(false)
  })

  it('should return true for the correct password', async () => {
    const result = await checkPasswordHash(password2, hash2)
    expect(result).toBe(true)
  })

  it('should return false for the wrong password', async () => {
    const result = await checkPasswordHash(password2, 'test')
    expect(result).toBe(false)
  })
})

describe('Make JWT and Validate', () => {
  const userID = 'andy'
  const expiresInSec = 60
  const secret = 'esta es mi secreto'

  const jwt = makeJWT(userID, expiresInSec, secret)

  it('should return andy', () => {
    const result = validateJWT(jwt, secret)
    expect(result).toBe(userID)
  })
})
