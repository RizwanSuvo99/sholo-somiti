/**
 * Creates or updates the one admin account.
 *
 * Deliberately separate from `prisma/seed.ts`: that seeds 28 placeholder
 * members, eight months of dues and a set of expense heads, which is right for
 * a development database and completely wrong for a live one. Running the seed
 * against production would fill a real society's register with invented people.
 *
 * Usage (on the server, from /opt/sholo-somiti):
 *   docker compose -f docker-compose.prod.yml run --rm \
 *     -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... -e ADMIN_NAME=... \
 *     migrate pnpm tsx scripts/create-admin.ts
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const BCRYPT_COST = 12
const MIN_PASSWORD_LENGTH = 12

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME?.trim() || 'প্রশাসক'

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must both be set.')
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
  const existing = await prisma.admin.findUnique({ where: { email }, select: { id: true } })

  // Updating the password is the point when run a second time: it is the only
  // way back in if the credential is lost.
  const admin = await prisma.admin.upsert({
    where: { email },
    update: { name, passwordHash, isActive: true },
    create: { email, name, passwordHash },
    select: { id: true, email: true, name: true },
  })

  console.log(`${existing ? 'Updated' : 'Created'} admin ${admin.email} (${admin.name}).`)
  console.log(`Total admins: ${await prisma.admin.count()}`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
