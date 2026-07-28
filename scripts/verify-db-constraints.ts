/**
 * Assert that the constraints Prisma's schema cannot express are still in place.
 *
 * `prisma db push` silently drops them, which would quietly downgrade the
 * one-submission-per-month rule to application-only enforcement — it would still
 * *look* like it worked, right up until two requests raced. Run this in CI and
 * after any schema surgery.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const REQUIRED_INDEXES = ['payment_submissions_active_member_month_key']

const REQUIRED_CHECKS = [
  'due_payments_amounts_non_negative',
  'due_payments_month_range',
  'monthly_due_settings_amount_non_negative',
  'monthly_due_settings_month_range',
  'payment_submissions_amount_positive',
  'payment_submissions_due_month_range',
  'payment_submissions_medium_shape',
  'payment_submissions_rejection_has_reason',
  'transactions_amount_positive',
  'transactions_category_shape',
  'transactions_note_not_blank',
]

async function main() {
  const missing: string[] = []

  const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `
  const indexNames = new Set(indexes.map((row) => row.indexname))
  for (const name of REQUIRED_INDEXES) {
    if (!indexNames.has(name)) missing.push(`index ${name}`)
  }

  const checks = await prisma.$queryRaw<{ conname: string }[]>`
    SELECT conname FROM pg_constraint
    WHERE contype = 'c' AND connamespace = 'public'::regnamespace
  `
  const checkNames = new Set(checks.map((row) => row.conname))
  for (const name of REQUIRED_CHECKS) {
    if (!checkNames.has(name)) missing.push(`check constraint ${name}`)
  }

  // The partial index is worthless if it is not actually partial.
  const [partial] = await prisma.$queryRaw<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes
    WHERE indexname = 'payment_submissions_active_member_month_key'
  `
  const definition = partial?.indexdef ?? ''
  if (
    partial &&
    !(
      definition.includes('WHERE') &&
      definition.includes('PENDING') &&
      definition.includes('APPROVED')
    )
  ) {
    missing.push('payment_submissions_active_member_month_key lost its WHERE clause')
  }

  const counter = await prisma.counter.findUnique({ where: { key: 'member_code' } })
  if (!counter) missing.push("counters row 'member_code'")

  if (missing.length > 0) {
    console.error('✗ Database is missing constraints that the application depends on:\n')
    for (const item of missing) console.error(`    - ${item}`)
    console.error('\nThis usually means `prisma db push` was run. Re-apply migrations with')
    console.error('`pnpm db:deploy` (or `pnpm db:reset` in development).')
    process.exit(1)
  }

  console.log(
    `✓ ${REQUIRED_INDEXES.length} index and ${REQUIRED_CHECKS.length} check constraints verified.`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
