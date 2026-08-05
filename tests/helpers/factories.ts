import { prisma } from './db'
import { civilToDbDate, parseCivilDate, type DueMonth } from '@/lib/due-cycle'
import { formatMemberCode } from '@/lib/member-code'

export async function makeAdmin(email = 'admin@test.local') {
  return prisma.admin.create({
    data: { email, name: 'পরীক্ষক', passwordHash: 'x'.repeat(60) },
  })
}

let sequence = 0

export async function makeMember(overrides: { joinedOn?: string; name?: string } = {}) {
  sequence += 1
  return prisma.member.create({
    data: {
      memberCode: formatMemberCode(2025, sequence),
      name: overrides.name ?? `সদস্য ${sequence}`,
      joinedOn: civilToDbDate(parseCivilDate(overrides.joinedOn ?? '2025-01-01')),
    },
  })
}

export function resetFactorySequence() {
  sequence = 0
}

export async function makeDueSetting(dm: DueMonth, amountPaisa: number) {
  return prisma.monthlyDueSetting.upsert({
    where: { year_month: { year: dm.dueYear, month: dm.dueMonth } },
    update: { amountPaisa },
    create: { year: dm.dueYear, month: dm.dueMonth, amountPaisa },
  })
}

export async function makeSubmission(
  memberId: string,
  memberCode: string,
  dm: DueMonth,
  overrides: { sendingDate?: string; amountPaisa?: number } = {},
) {
  return prisma.paymentSubmission.create({
    data: {
      memberId,
      name: 'সদস্য',
      memberCodeSnapshot: memberCode,
      sendingDate: civilToDbDate(parseCivilDate(overrides.sendingDate ?? '2026-04-10')),
      amountPaisa: overrides.amountPaisa ?? 50_000,
      transactionRef: `TXN${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      paymentMedium: 'MOBILE_BANKING',
      mobileBankingProvider: 'BKASH',
      mobileBankingNumber: '01700000000',
      screenshotUrl: 'https://example.invalid/proof.jpg',
      dueMonth: dm.dueMonth,
      dueYear: dm.dueYear,
    },
  })
}
