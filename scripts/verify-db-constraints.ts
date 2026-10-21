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
import { parseMemberCode } from '../src/lib/member-code'

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
  'personal_loans_amount_positive',
  'personal_repayments_amount_positive',
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

  // The counter records how many codes have been *issued*, not the highest code
  // in use. Hand-editing a member_code therefore leaves the two out of step:
  // move NHSS-26030 to a vacant NHSS-25002 and number 30 is spent but belongs to
  // nobody, so the next member silently skips to 31. Report that drift here
  // rather than discovering it in the member list.
  if (counter) {
    const codes = await prisma.member.findMany({ select: { memberCode: true } })
    const sequences = codes
      .map((row) => parseMemberCode(row.memberCode)?.sequence)
      .filter((value): value is number => value !== undefined)
    const highest = sequences.length > 0 ? Math.max(...sequences) : 0

    if (counter.value < highest) {
      // The next create would re-issue a number that is already taken and fail
      // on the unique index.
      missing.push(
        `counters.member_code is ${counter.value} but sequence ${highest} is already in use`,
      )
    }

    const taken = new Set(sequences)
    const gaps = Array.from({ length: counter.value }, (_, i) => i + 1).filter(
      (seq) => !taken.has(seq),
    )
    if (gaps.length > 0) {
      console.warn(
        `! member-code sequence has ${gaps.length} issued but unused number(s): ${gaps.join(', ')}.`,
      )
      console.warn(
        '  Expected after deleting a member. Unexpected after renaming one — in that',
      )
      console.warn(
        "  case lower 'counters.member_code' so the sequence stays continuous.\n",
      )
    }
  }

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
