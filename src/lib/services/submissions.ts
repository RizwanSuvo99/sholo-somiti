import 'server-only'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import {
  civilToDbDate,
  currentDueMonth,
  dbDateToCivil,
  dueMonthForCivilDate,
  dueMonthsBetween,
  addMonths,
  compareDueMonth,
  type CivilDate,
  type DueMonth,
} from '@/lib/due-cycle'
import { allocate, fineFor, settlementStatus } from '@/lib/fines'
import { dueMonthLabel } from '@/lib/bn'
import { conflict, duplicateSubmission, notFound } from '@/lib/api/errors'

export type EligibleMonth = {
  dueMonth: number
  dueYear: number
  label: string
  amountPaisa: number | null
  blocked: boolean
  blockedReason: string | null
  isCurrent: boolean
}

export type LookupResult = {
  found: true
  member: { id: string; memberCode: string; name: string }
  currentDue: {
    dueMonth: number
    dueYear: number
    label: string
    amountPaisa: number | null
  }
  eligibleDueMonths: EligibleMonth[]
}

/**
 * What the public form needs the moment a member types their ID.
 *
 * Returns the member's *name only* — never mobile or email. Member codes are
 * sequential and therefore guessable, so this endpoint is a name-enumeration
 * oracle over the whole society; the rate limit and this narrow projection are
 * what keep that exposure to a minimum.
 */
export async function lookupMember(
  memberCode: string,
  now = new Date(),
): Promise<LookupResult | null> {
  const member = await prisma.member.findUnique({
    where: { memberCode },
    select: { id: true, memberCode: true, name: true, isActive: true },
  })

  if (!member || !member.isActive) return null

  const current = currentDueMonth(now)

  // Candidate months: this cycle, plus any earlier month the member still owes.
  // Paying an earlier month is what makes a late settlement possible at all.
  const unpaid = await prisma.duePayment.findMany({
    where: { memberId: member.id, status: { in: ['PENDING', 'UNPAID'] } },
    select: { year: true, month: true, amountDuePaisa: true },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  })

  const candidates = new Map<string, DueMonth>()
  for (const row of unpaid) candidates.set(`${row.year}-${row.month}`, { dueYear: row.year, dueMonth: row.month })
  candidates.set(`${current.dueYear}-${current.dueMonth}`, current)

  const months = [...candidates.values()].sort(compareDueMonth)

  const [active, settings] = await Promise.all([
    prisma.paymentSubmission.findMany({
      where: {
        memberId: member.id,
        status: { in: ['PENDING', 'APPROVED'] },
        OR: months.map((dm) => ({ dueYear: dm.dueYear, dueMonth: dm.dueMonth })),
      },
      select: { dueYear: true, dueMonth: true, status: true },
    }),
    prisma.monthlyDueSetting.findMany({
      where: { OR: months.map((dm) => ({ year: dm.dueYear, month: dm.dueMonth })) },
      select: { year: true, month: true, amountPaisa: true },
    }),
  ])

  const blockedBy = new Map(active.map((row) => [`${row.dueYear}-${row.dueMonth}`, row.status]))
  const amountOf = new Map(settings.map((row) => [`${row.year}-${row.month}`, row.amountPaisa]))

  const eligibleDueMonths: EligibleMonth[] = months.map((dm) => {
    const key = `${dm.dueYear}-${dm.dueMonth}`
    const status = blockedBy.get(key)
    return {
      dueMonth: dm.dueMonth,
      dueYear: dm.dueYear,
      label: dueMonthLabel(dm),
      amountPaisa: amountOf.get(key) ?? null,
      blocked: Boolean(status),
      blockedReason:
        status === 'PENDING'
          ? 'এই মাসের আবেদন যাচাইয়ের অপেক্ষায় আছে'
          : status === 'APPROVED'
            ? 'এই মাসের চাঁদা ইতিমধ্যে জমা হয়েছে'
            : null,
      isCurrent: dm.dueYear === current.dueYear && dm.dueMonth === current.dueMonth,
    }
  })

  return {
    found: true,
    member: { id: member.id, memberCode: member.memberCode, name: member.name },
    currentDue: {
      dueMonth: current.dueMonth,
      dueYear: current.dueYear,
      label: dueMonthLabel(current),
      amountPaisa: amountOf.get(`${current.dueYear}-${current.dueMonth}`) ?? null,
    },
    eligibleDueMonths,
  }
}

export type CreateSubmissionInput = {
  memberCode: string
  name: string
  sendingDate: CivilDate
  amountPaisa: number
  transactionRef: string
  paymentMedium: 'NPSB' | 'EFT' | 'MOBILE_BANKING' | 'CASH_DEPOSIT'
  bankName?: string | null
  mobileBankingProvider?: 'BKASH' | 'NAGAD' | null
  mobileBankingNumber?: string | null
  screenshotUrl: string
  screenshotPublicId?: string | null
  dueMonth?: number
  dueYear?: number
  ipAddress?: string
}

export async function createSubmission(input: CreateSubmissionInput) {
  const member = await prisma.member.findUnique({
    where: { memberCode: input.memberCode },
    select: { id: true, memberCode: true, isActive: true },
  })

  if (!member || !member.isActive) throw notFound('Member', 'সদস্য')

  // The due month is resolved on the server. A client-supplied month is accepted
  // only as a choice among months the member may legitimately pay.
  const derived = dueMonthForCivilDate(input.sendingDate)
  const target: DueMonth =
    input.dueMonth && input.dueYear
      ? { dueMonth: input.dueMonth, dueYear: input.dueYear }
      : derived

  if (compareDueMonth(target, derived) > 0) {
    throw conflict(
      'CONFLICT',
      'Cannot pay for a future due month',
      'ভবিষ্যতের মাসের চাঁদা এখন জমা দেওয়া যাবে না',
    )
  }

  // Layer 2 of the one-per-month rule: a clear message before the database has
  // to reject it. Layer 3 (the partial unique index) is what actually holds
  // under concurrency; this check can lose a race and that is fine.
  const existing = await prisma.paymentSubmission.findFirst({
    where: {
      memberId: member.id,
      dueYear: target.dueYear,
      dueMonth: target.dueMonth,
      status: { in: ['PENDING', 'APPROVED'] },
    },
    select: { id: true },
  })
  if (existing) throw duplicateSubmission()

  return prisma.paymentSubmission.create({
    data: {
      memberId: member.id,
      name: input.name,
      memberCodeSnapshot: member.memberCode,
      sendingDate: civilToDbDate(input.sendingDate),
      amountPaisa: input.amountPaisa,
      transactionRef: input.transactionRef,
      paymentMedium: input.paymentMedium,
      bankName: input.bankName ?? null,
      mobileBankingProvider: input.mobileBankingProvider ?? null,
      mobileBankingNumber: input.mobileBankingNumber ?? null,
      screenshotUrl: input.screenshotUrl,
      screenshotPublicId: input.screenshotPublicId ?? null,
      dueMonth: target.dueMonth,
      dueYear: target.dueYear,
      submitterIpHash: input.ipAddress
        ? createHash('sha256').update(input.ipAddress).digest('hex').slice(0, 32)
        : null,
    },
    select: { id: true, dueMonth: true, dueYear: true, status: true },
  })
}

export type ApproveOptions = {
  dueMonth?: number
  dueYear?: number
  note?: string
}

export type ApproveResult = {
  submissionId: string
  duePaymentId: string
  status: 'PAID_ON_TIME' | 'PAID_LATE'
  finePaisa: number
  allocation: { toDue: number; toFine: number; surplus: number; shortfall: number }
  warnings: string[]
}

/**
 * Approve a submission: settle the month and write the ledger, atomically.
 *
 * A partial write here corrupts the accounts, so everything happens in one
 * serializable transaction, and the first statement is a conditional update that
 * claims the row — two admins clicking at once means one wins and the other gets
 * a 409, rather than both proceeding on a row each believed was PENDING.
 */
export async function approveSubmission(
  submissionId: string,
  adminId: string,
  options: ApproveOptions = {},
): Promise<ApproveResult> {
  return prisma.$transaction(
    async (tx) => {
      const claimed = await tx.paymentSubmission.updateMany({
        where: { id: submissionId, status: 'PENDING' },
        data: { status: 'APPROVED', reviewedById: adminId, reviewedAt: new Date() },
      })

      if (claimed.count === 0) {
        throw conflict(
          'SUBMISSION_ALREADY_REVIEWED',
          'Submission is no longer pending',
          'এই আবেদনটি ইতিমধ্যে যাচাই করা হয়েছে',
        )
      }

      const submission = await tx.paymentSubmission.findUniqueOrThrow({
        where: { id: submissionId },
      })

      const target: DueMonth =
        options.dueMonth && options.dueYear
          ? { dueMonth: options.dueMonth, dueYear: options.dueYear }
          : { dueMonth: submission.dueMonth, dueYear: submission.dueYear }

      if (target.dueMonth !== submission.dueMonth || target.dueYear !== submission.dueYear) {
        // Re-targeting can collide with the member's existing submission for that
        // month; the partial unique index reports it and withRoute maps it to 409.
        await tx.paymentSubmission.update({
          where: { id: submissionId },
          data: { dueMonth: target.dueMonth, dueYear: target.dueYear },
        })
      }

      const warnings: string[] = []

      const setting = await tx.monthlyDueSetting.findUnique({
        where: { year_month: { year: target.dueYear, month: target.dueMonth } },
        select: { amountPaisa: true },
      })
      if (!setting) warnings.push('DUE_SETTING_MISSING')

      const existing = await tx.duePayment.findUnique({
        where: {
          memberId_year_month: {
            memberId: submission.memberId,
            year: target.dueYear,
            month: target.dueMonth,
          },
        },
      })

      if (existing && (existing.status === 'PAID_ON_TIME' || existing.status === 'PAID_LATE')) {
        throw conflict(
          'ALREADY_PAID',
          'This month is already settled',
          'এই মাসের চাঁদা ইতিমধ্যে পরিশোধিত — অতিরিক্ত জমা হলে ম্যানুয়াল এন্ট্রি ব্যবহার করুন',
        )
      }

      const sendingCivil = dbDateToCivil(submission.sendingDate)
      const status = settlementStatus(sendingCivil, target)
      const finePaisa = fineFor(sendingCivil, target, existing?.finePaisa ?? 0)
      const amountDuePaisa = existing?.amountDuePaisa || (setting?.amountPaisa ?? 0)

      const allocation = allocate(submission.amountPaisa, amountDuePaisa, finePaisa)

      const duePayment = await tx.duePayment.upsert({
        where: {
          memberId_year_month: {
            memberId: submission.memberId,
            year: target.dueYear,
            month: target.dueMonth,
          },
        },
        create: {
          memberId: submission.memberId,
          year: target.dueYear,
          month: target.dueMonth,
          amountDuePaisa,
          amountPaidPaisa: allocation.toDue,
          finePaisa,
          finePaidPaisa: allocation.toFine,
          // Paid when the member sent it, not when it was reviewed.
          paidAt: submission.sendingDate,
          status,
          sourceSubmissionId: submission.id,
          note: options.note ?? null,
        },
        update: {
          amountDuePaisa,
          amountPaidPaisa: allocation.toDue,
          finePaisa,
          finePaidPaisa: allocation.toFine,
          paidAt: submission.sendingDate,
          status,
          sourceSubmissionId: submission.id,
          ...(options.note ? { note: options.note } : {}),
        },
      })

      const label = dueMonthLabel(target)
      const common = {
        type: 'INCOME' as const,
        memberId: submission.memberId,
        duePaymentId: duePayment.id,
        sourceSubmissionId: submission.id,
        entryDate: submission.sendingDate,
        createdById: adminId,
      }

      // Deterministic keys, so replaying an approval cannot double the ledger.
      const ledgerRows = [
        allocation.toDue > 0 && {
          ...common,
          incomeCategory: 'MONTHLY_DUE' as const,
          amountPaisa: allocation.toDue,
          note: `${label} মাসের চাঁদা — ${submission.transactionRef}`,
          idempotencyKey: `sub:${submission.id}:due`,
        },
        allocation.toFine > 0 && {
          ...common,
          incomeCategory: 'FINE' as const,
          amountPaisa: allocation.toFine,
          note: `${label} মাসের বিলম্ব জরিমানা — ${submission.transactionRef}`,
          idempotencyKey: `sub:${submission.id}:fine`,
        },
        allocation.surplus > 0 && {
          ...common,
          incomeCategory: 'OTHER_INCOME' as const,
          amountPaisa: allocation.surplus,
          note: `${label} মাসের অতিরিক্ত জমা — ${submission.transactionRef}`,
          idempotencyKey: `sub:${submission.id}:surplus`,
        },
      ].filter((row) => row !== false)

      if (ledgerRows.length > 0) {
        await tx.transaction.createMany({ data: ledgerRows, skipDuplicates: true })
      }

      if (allocation.shortfall > 0) warnings.push('UNDERPAID')
      if (allocation.surplus > 0) warnings.push('OVERPAID')

      return {
        submissionId: submission.id,
        duePaymentId: duePayment.id,
        status,
        finePaisa,
        allocation,
        warnings,
      }
    },
    { isolationLevel: 'Serializable', timeout: 15_000 },
  )
}

export async function rejectSubmission(
  submissionId: string,
  adminId: string,
  reason: string,
) {
  const rejected = await prisma.paymentSubmission.updateMany({
    where: { id: submissionId, status: 'PENDING' },
    data: {
      status: 'REJECTED',
      rejectionReason: reason,
      reviewedById: adminId,
      reviewedAt: new Date(),
    },
  })

  if (rejected.count === 0) {
    throw conflict(
      'SUBMISSION_ALREADY_REVIEWED',
      'Submission is no longer pending',
      'এই আবেদনটি ইতিমধ্যে যাচাই করা হয়েছে',
    )
  }

  // No ledger rows are written. Because the unique index skips REJECTED rows,
  // the member is immediately free to submit again for the same month.
  return { submissionId, status: 'REJECTED' as const }
}

/** What approving would do, for the review screen — computed, not persisted. */
export function previewSettlement(
  sendingDate: Date,
  dm: DueMonth,
  amountPaisa: number,
  amountDuePaisa: number,
  alreadyFinedPaisa: number,
) {
  const civil = dbDateToCivil(sendingDate)
  const status = settlementStatus(civil, dm)
  const finePaisa = fineFor(civil, dm, alreadyFinedPaisa)
  return { status, finePaisa, allocation: allocate(amountPaisa, amountDuePaisa, finePaisa) }
}

/** Months a member could legitimately be paying, newest first. */
export function recentDueMonths(now = new Date(), back = 6): DueMonth[] {
  const current = currentDueMonth(now)
  return dueMonthsBetween(addMonths(current, -back), current).reverse()
}
