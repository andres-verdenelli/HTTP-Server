import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { db } from '../index.js'
import { NewUser, refreshTokens, users } from '../schema.js'

export async function createUser(user: NewUser) {
  const [result] = await db
    .insert(users)
    .values(user)
    .onConflictDoNothing()
    .returning()
  return result
}

export async function deleteAllUsers() {
  await db.delete(users)
}

export async function getUserByEmail(email: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  })
  return user
}

export async function getUserFromRefreshToken(token: string) {
  // Si ya tenés esta query escrita, usá la tuya.
  // Esta versión hace: join + valida no revocado y no expirado.
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
    })
    .from(refreshTokens)
    .innerJoin(users, eq(refreshTokens.userId, users.id))
    .where(
      and(
        eq(refreshTokens.token, token),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, sql`now()`)
      )
    )
    .limit(1)

  return rows[0] ?? null
}

export async function updateUserCredentials(params: {
  id: string
  email: string
  hashedPassword: string
}) {
  const { id, email, hashedPassword } = params
  const [row] = await db
    .update(users)
    .set({ email, hashedPassword })
    .where(eq(users.id, id))
    .returning()

  return row ?? null
}
