import { asc, eq } from 'drizzle-orm'
import { db } from '../index.js'
import { chirps, NewChirp } from '../schema.js'

export async function createChirp(chirp: NewChirp) {
  const [result] = await db.insert(chirps).values(chirp).returning()
  return result
}

export async function getAllChirps() {
  const allChrips = await db
    .select()
    .from(chirps)
    .orderBy(asc(chirps.createdAt))
  return allChrips
}

export async function getChirp(chirpId: string) {
  // const [result] = await db.select().from(chirps).where(eq(chirps.id, chirpId))
  const chirp = await db.query.chirps.findFirst({
    where: eq(chirps.id, chirpId),
  })
  return chirp
}

export async function deleteChirpById(chirpId: string) {
  const deleted = await db
    .delete(chirps)
    .where(eq(chirps.id, chirpId))
    .returning({ id: chirps.id })
  return deleted.length > 0
}
