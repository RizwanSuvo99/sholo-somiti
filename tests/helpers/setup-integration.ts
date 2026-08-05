import { execSync } from 'node:child_process'
import { beforeAll, afterAll } from 'vitest'
import { prisma, TEST_DATABASE_URL } from './db'

// The services read process.env.DATABASE_URL through src/lib/prisma.ts, so point
// them at the test database before any of them are imported.
process.env.DATABASE_URL = TEST_DATABASE_URL
process.env.DIRECT_DATABASE_URL = TEST_DATABASE_URL
process.env.SESSION_SECRET ??= 'test-session-secret-at-least-32-characters-long'
process.env.CRON_SECRET ??= 'test-cron-secret-value'
process.env.CLOUDINARY_CLOUD_NAME ??= 'test'
process.env.CLOUDINARY_API_KEY ??= 'test'
process.env.CLOUDINARY_API_SECRET ??= 'test'

beforeAll(() => {
  // Apply migrations — including the hand-written ones carrying the partial
  // unique index, which is precisely what these tests are here to exercise.
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_DATABASE_URL: TEST_DATABASE_URL },
  })
})

afterAll(async () => {
  await prisma.$disconnect()
})
