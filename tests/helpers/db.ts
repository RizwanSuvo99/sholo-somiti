import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

/**
 * Integration tests run against a real Postgres — the whole point is to exercise
 * the constraints that only exist in the database (the partial unique index, the
 * CHECKs, the transactional counter).
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://somiti:somiti_dev_password@localhost:5434/somiti_test?schema=public'

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
})

/** Wipe every table but keep the schema (and re-seed the member-code counter). */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      transactions, due_payments, payment_submissions, historical_imports,
      monthly_due_settings, expense_categories, members, job_runs, admins
    RESTART IDENTITY CASCADE
  `)
  await prisma.$executeRawUnsafe(`
    INSERT INTO counters (key, value) VALUES ('member_code', 0)
    ON CONFLICT (key) DO UPDATE SET value = 0
  `)
}
