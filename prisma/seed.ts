/**
 * Development seed: one admin, 28 placeholder members, and due settings for the
 * current and previous cycles.
 *
 * Idempotent — it upserts, so running it twice changes nothing. The member names
 * are obvious placeholders; real members are added through /admin/members.
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import {
  addMonths,
  civilToDbDate,
  currentDueMonth,
  dueMonthsBetween,
  type DueMonth,
} from '../src/lib/due-cycle'
import { formatMemberCode } from '../src/lib/member-code'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const BCRYPT_COST = 12
const MEMBER_COUNT = 28
const DEFAULT_DUE_PAISA = 50_000 // ৳500 per month

/**
 * The year the society's founding members joined. Their codes therefore read
 * NHSS-25001 … NHSS-25028, matching the specification's example. Members added
 * later carry their own joining year while the sequence keeps counting, so the
 * first new member in 2026 is NHSS-26029.
 */
const FOUNDING_YEAR = 2025

/** Placeholder Bengali names — clearly not real people. */
const GIVEN_NAMES = [
  'আব্দুল', 'মোহাম্মদ', 'রফিকুল', 'শাহাদাত', 'নাজমুল', 'কামরুল', 'ফরিদ',
  'জাহাঙ্গীর', 'মিজানুর', 'সাইফুল', 'আনিসুর', 'বেলাল', 'হাবিবুর', 'তরিকুল',
  'মাহবুব', 'শফিকুল', 'রুহুল', 'আক্তার', 'সোহেল', 'নুরুল', 'দেলোয়ার',
  'জসিম', 'মোস্তফা', 'ইমরান', 'রাশেদ', 'সেলিম', 'আলমগীর', 'ওয়াহিদ',
]
const SURNAMES = ['ইসলাম', 'হোসেন', 'রহমান', 'আহমেদ', 'উদ্দিন', 'মিয়া', 'সরকার']

function memberName(index: number): string {
  return `${GIVEN_NAMES[index % GIVEN_NAMES.length]} ${SURNAMES[index % SURNAMES.length]}`
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME ?? 'প্রশাসক'

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env before seeding.')
  }
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters.')
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)

  const admin = await prisma.admin.upsert({
    where: { email },
    // Re-seeding must not silently reset a password the admin has since changed.
    update: { name },
    create: { email, name, passwordHash },
  })

  console.log(`  admin: ${admin.email}`)
  return admin
}

async function seedMembers() {
  const existing = await prisma.member.count()
  if (existing > 0) {
    console.log(`  members: ${existing} already present, skipping`)
    return
  }

  // Backdated to the founding year, so the codes read NHSS-25001 upwards and
  // every member is billable for each cycle the seed creates.
  const joinYear = FOUNDING_YEAR
  const joinedOn = civilToDbDate({ y: joinYear, m: 1, d: 1 })

  await prisma.$transaction(async (tx) => {
    for (let i = 1; i <= MEMBER_COUNT; i += 1) {
      const [{ value: sequence }] = await tx.$queryRaw<{ value: number }[]>`
        UPDATE counters SET value = value + 1 WHERE key = 'member_code' RETURNING value
      `
      await tx.member.create({
        data: {
          memberCode: formatMemberCode(joinYear, sequence),
          name: memberName(i - 1),
          fatherName: `${GIVEN_NAMES[(i + 3) % GIVEN_NAMES.length]} ${SURNAMES[(i + 2) % SURNAMES.length]}`,
          mobile: `01${String(700000000 + i * 137).slice(0, 9)}`,
          joinedOn,
        },
      })
    }
  })

  console.log(`  members: ${MEMBER_COUNT} created`)
}

async function seedDueSettings() {
  const current = currentDueMonth()
  // Six months of history plus the month now open for collection.
  const months: DueMonth[] = dueMonthsBetween(addMonths(current, -6), addMonths(current, 1))

  for (const dm of months) {
    await prisma.monthlyDueSetting.upsert({
      where: { year_month: { year: dm.dueYear, month: dm.dueMonth } },
      update: {},
      create: { year: dm.dueYear, month: dm.dueMonth, amountPaisa: DEFAULT_DUE_PAISA },
    })
  }

  console.log(`  due settings: ${months.length} months at ৳${DEFAULT_DUE_PAISA / 100}`)
}

async function seedExpenseCategories() {
  const names = ['অফিস ভাড়া', 'ছাপার খরচ', 'অনুষ্ঠান', 'যাতায়াত', 'ব্যাংক চার্জ', 'বিবিধ']
  for (const name of names) {
    await prisma.expenseCategory.upsert({ where: { name }, update: {}, create: { name } })
  }
  console.log(`  expense categories: ${names.length}`)
}

async function main() {
  console.log('Seeding ষোলো সমবায় সমিতি…')
  await seedAdmin()
  await seedMembers()
  await seedDueSettings()
  await seedExpenseCategories()
  console.log('Done.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
