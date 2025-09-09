import { refreshTokens } from '../schema.js'
import { db } from '../index.js'
import { eq, sql } from 'drizzle-orm'

export async function createRefreshToken(input: {
  token: string
  userId: string
  expiresAt: Date
}) {
  const { token, userId, expiresAt } = input
  await db.insert(refreshTokens).values({
    token,
    userId,
    expiresAt,
  })
  //tendria que devolver algo???
}

export async function revokeRefreshToken(token: string) {
  await db
    .update(refreshTokens)
    .set({
      revokedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(refreshTokens.token, token))
}
