import { eq } from 'drizzle-orm'
import { db } from '../index.js'
import { NewUser, users } from '../schema.js'

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
