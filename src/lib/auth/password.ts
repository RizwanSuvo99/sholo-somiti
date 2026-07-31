import bcrypt from 'bcryptjs'

/**
 * bcryptjs rather than argon2: it is pure JavaScript, so there is no native
 * build step to fail on deploy. With a single admin account the throughput
 * difference is irrelevant.
 */
const COST = 12

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
