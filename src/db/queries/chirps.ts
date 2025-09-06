import { asc } from 'drizzle-orm'
import { db } from '../index.js'
import { chirps, NewChirp } from '../schema.js'

export async function createChirp(chirp: NewChirp) {
  const [result] = await db.insert(chirps).values(chirp).returning()
  return result
}

export async function getAllChirps() {
  const result = await db.select().from(chirps).orderBy(asc(chirps.createdAt))
  return result
}
