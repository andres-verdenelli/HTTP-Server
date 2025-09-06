import { pgTable, timestamp, varchar, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  email: varchar('email', { length: 256 }).unique().notNull(),
  hashedPassword: varchar('hashed_password').default('unset').notNull(),
})

export const chirps = pgTable('chirps', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  body: varchar('body').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
})

export type NewUser = typeof users.$inferInsert
export type NewChirp = typeof chirps.$inferInsert
