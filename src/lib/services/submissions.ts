import 'server-only'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import {
  civilToDbDate,
  currentDueMonth,
  dbDateToCivil,
  dueMonthForCivilDate,
  compareDueMonth,
  type CivilDate,
  type DueMonth,
} from '@/lib/due-cycle'
import { settlementStatus } from '@/lib/fines'
import { fineOwedFor, planSettlement, type OutstandingMonth } from '@/lib/settlement'
import { dueMonthLabel } from '@/lib/bn'
import { conflict, duplicateSubmission, notFound } from '@/lib/api/errors'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export type EligibleMonth = {
  dueMonth: number
  dueYear: number
  label: string
  /** The subscription set for this month, or null if the admin has not set one. */
  amountPaisa: number | null
  /** Still owed on the subscription — the amount less anything already paid. */
  outstandingDuePaisa: number
  /** A fine already on the ledger for this month, less anything paid towards it. */
  chargedFinePaisa: number
  /** Whether the admin has set a subscription for this month yet. */
  amountSet: boolean
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
    select: {
      year: true,
      month: true,
      amountDuePaisa: true,
      amountPaidPaisa: true,
      finePaisa: true,
      finePaidPaisa: true,
    },
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
  const rowOf = new Map(unpaid.map((row) => [`${row.year}-${row.month}`, row]))

  const eligibleDueMonths: EligibleMonth[] = months.map((dm) => {
    const key = `${dm.dueYear}-${dm.dueMonth}`
    const status = blockedBy.get(key)
    const row = rowOf.get(key)

    // Prefer the amount snapshotted on the member's row: the admin may have
    // changed the setting since, and the member owes what they were billed.
    // Where no row exists yet, the current setting is the best estimate.
    const setting = amountOf.get(key) ?? null
    const billed = row ? (row.amountDuePaisa || (setting ?? 0)) : (setting ?? 0)

    // A month the admin has not priced yet cannot be paid: the form would quote
    // nothing and approval would file the money as surplus instead of a
    // subscription. A month already billed on the member's own row counts as
    // priced even if the setting was removed since.
    const amountSet = setting !== null || (row?.amountDuePaisa ?? 0) > 0

    return {
      dueMonth: dm.dueMonth,
      dueYear: dm.dueYear,
      label: dueMonthLabel(dm),
      amountPaisa: row ? billed : setting,
      outstandingDuePaisa: Math.max(0, billed - (row?.amountPaidPaisa ?? 0)),
      chargedFinePaisa: Math.max(0, (row?.finePaisa ?? 0) - (row?.finePaidPaisa ?? 0)),
      amountSet,
      blocked: Boolean(status) || !amountSet,
      blockedReason: !amountSet
        ? 'এই মাসের চাঁদার পরিমাণ এখনো নির্ধারণ করা হয়নি'
        : status === 'PENDING'
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

  // The month must have a price before anyone can pay it. The form hides such
  // months, but this endpoint is public and reachable directly.
  const [priced, billedRow] = await Promise.all([
    prisma.monthlyDueSetting.findUnique({
      where: { year_month: { year: target.dueYear, month: target.dueMonth } },
      select: { amountPaisa: true },
    }),
    prisma.duePayment.findUnique({
      where: {
        memberId_year_month: {
          memberId: member.id,
          year: target.dueYear,
          month: target.dueMonth,
        },
      },
      select: { amountDuePaisa: true },
    }),
  ])

  if (priced === null && (billedRow?.amountDuePaisa ?? 0) === 0) {
    throw conflict(
      'CONFLICT',
      'No subscription has been set for that month',
      `${dueMonthLabel(target)} মাসের চাঁদার পরিমাণ এখনো নির্ধারণ করা হয়নি — প্রশাসক নির্ধারণ করলে জমা দেওয়া যাবে`,
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

export type SettledMonth = {
  dueMonth: number
  dueYear: number
  label: string
  duePaidPaisa: number
  finePaidPaisa: number
  status: 'PAID_ON_TIME' | 'PAID_LATE' | 'PENDING' | 'UNPAID'
}

export type ApproveResult = {
  submissionId: string
  months: SettledMonth[]
  totalOwedPaisa: number
  shortfallPaisa: number
  surplusPaisa: number
  warnings: string[]
}

/**
 * Gather every month a payment should clear, oldest first.
 *
 * A member who missed a month owes that month, its fine, and the current month
 * too, and sends the lot in one transfer. So the months covered run from their
 * oldest unsettled month up to the one the submission names.
 *
 * Months with their own active submission are left out: that money is already
 * claimed, and settling them here would take payment for them twice.
 */
async function monthsToSettle(
  tx: Tx,
  memberId: string,
  target: DueMonth,
  submissionId: string,
) {
  const [rows, claimed, targetRow] = await Promise.all([
    tx.duePayment.findMany({
      where: { memberId, status: { in: ['PENDING', 'UNPAID'] } },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    }),
    tx.paymentSubmission.findMany({
      where: { memberId, status: 'PENDING', id: { not: submissionId } },
      select: { dueYear: true, dueMonth: true },
    }),
    // Looked up regardless of status: a month already settled must not be
    // billed a second time just because it is absent from the unpaid list.
    tx.duePayment.findUnique({
      where: {
        memberId_year_month: { memberId, year: target.dueYear, month: target.dueMonth },
      },
      select: { status: true },
    }),
  ])

  const spokenFor = new Set(claimed.map((row) => `${row.dueYear}-${row.dueMonth}`))

  const covered = rows.filter(
    (row) =>
      compareDueMonth({ dueYear: row.year, dueMonth: row.month }, target) <= 0 &&
      !spokenFor.has(`${row.year}-${row.month}`),
  )

  // The named month may have no row yet — dues for it might not be generated.
  const coveredHasTarget = covered.some(
    (row) => row.year === target.dueYear && row.month === target.dueMonth,
  )

  return { rows: covered, needsTargetRow: !coveredHasTarget && targetRow === null }
}

/**
 * Approve a submission: settle everything it covers and write the ledger,
 * atomically.
 *
 * A partial write here corrupts the accounts, so it all happens in one
 * serializable transaction, and the first statement is a conditional update
 * that claims the row — two admins clicking at once means one wins and the
 * other gets a conflict, rather than both proceeding on a row each believed
 * was pending.
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
        // Re-targeting can collide with the member's existing submission for
        // that month; the partial unique index reports it and withRoute maps it
        // to a 409.
        await tx.paymentSubmission.update({
          where: { id: submissionId },
          data: { dueMonth: target.dueMonth, dueYear: target.dueYear },
        })
      }

      const warnings: string[] = []
      const sendingCivil = dbDateToCivil(submission.sendingDate)

      const { rows, needsTargetRow } = await monthsToSettle(
        tx,
        submission.memberId,
        target,
        submissionId,
      )

      let targetAmountPaisa = 0
      if (needsTargetRow) {
        const setting = await tx.monthlyDueSetting.findUnique({
          where: { year_month: { year: target.dueYear, month: target.dueMonth } },
          select: { amountPaisa: true },
        })
        if (!setting) warnings.push('DUE_SETTING_MISSING')
        targetAmountPaisa = setting?.amountPaisa ?? 0
      }

      const outstanding: OutstandingMonth[] = [
        ...rows.map((row) => ({
          dueYear: row.year,
          dueMonth: row.month,
          duePaisa: Math.max(0, row.amountDuePaisa - row.amountPaidPaisa),
          finePaisa: fineOwedFor(
            { dueYear: row.year, dueMonth: row.month },
            sendingCivil,
            row.finePaisa,
            row.finePaidPaisa,
          ),
        })),
        ...(needsTargetRow
          ? [
              {
                dueYear: target.dueYear,
                dueMonth: target.dueMonth,
                duePaisa: targetAmountPaisa,
                finePaisa: fineOwedFor(target, sendingCivil, 0),
              },
            ]
          : []),
      ]

      if (outstanding.length === 0) {
        throw conflict(
          'ALREADY_PAID',
          'Nothing is outstanding for this member up to that month',
          'এই মাস পর্যন্ত সব চাঁদা ইতিমধ্যে পরিশোধিত — অতিরিক্ত জমা হলে ম্যানুয়াল এন্ট্রি ব্যবহার করুন',
        )
      }

      const plan = planSettlement(outstanding, submission.amountPaisa)
      const existingRow = new Map(rows.map((row) => [`${row.year}-${row.month}`, row]))

      const months: SettledMonth[] = []
      type LedgerRow = {
        type: 'INCOME'
        incomeCategory: 'MONTHLY_DUE' | 'FINE' | 'OTHER_INCOME'
        amountPaisa: number
        memberId: string
        duePaymentId?: string
        sourceSubmissionId: string
        entryDate: Date
        createdById: string
        note: string
        idempotencyKey: string
      }
      const ledgerRows: LedgerRow[] = []

      for (const allocation of plan.allocations) {
        const dm: DueMonth = { dueYear: allocation.dueYear, dueMonth: allocation.dueMonth }
        const key = `${dm.dueYear}-${dm.dueMonth}`
        const existing = existingRow.get(key)
        const label = dueMonthLabel(dm)

        // Judged on the date the member sent the money, never the review date:
        // a slow review must not cost anyone ৳২০০.
        const settledStatus = settlementStatus(sendingCivil, dm)
        const status = allocation.dueSettled ? settledStatus : (existing?.status ?? 'PENDING')

        const amountDuePaisa = existing?.amountDuePaisa || allocation.duePaisa
        const finePaisa = (existing?.finePaisa ?? 0) || allocation.finePaisa

        const duePayment = await tx.duePayment.upsert({
          where: {
            memberId_year_month: {
              memberId: submission.memberId,
              year: dm.dueYear,
              month: dm.dueMonth,
            },
          },
          create: {
            memberId: submission.memberId,
            year: dm.dueYear,
            month: dm.dueMonth,
            amountDuePaisa,
            amountPaidPaisa: allocation.toDue,
            finePaisa,
            finePaidPaisa: allocation.toFine,
            paidAt: allocation.toDue > 0 ? submission.sendingDate : null,
            status,
            sourceSubmissionId: submission.id,
            note: options.note ?? null,
          },
          update: {
            amountDuePaisa,
            amountPaidPaisa: (existing?.amountPaidPaisa ?? 0) + allocation.toDue,
            finePaisa,
            finePaidPaisa: (existing?.finePaidPaisa ?? 0) + allocation.toFine,
            ...(allocation.toDue > 0 ? { paidAt: submission.sendingDate } : {}),
            status,
            sourceSubmissionId: submission.id,
            ...(options.note ? { note: options.note } : {}),
          },
        })

        const common = {
          type: 'INCOME' as const,
          memberId: submission.memberId,
          duePaymentId: duePayment.id,
          sourceSubmissionId: submission.id,
          entryDate: submission.sendingDate,
          createdById: adminId,
        }

        // Deterministic keys, per month, so replaying an approval cannot double
        // the ledger.
        if (allocation.toDue > 0) {
          ledgerRows.push({
            ...common,
            incomeCategory: 'MONTHLY_DUE' as const,
            amountPaisa: allocation.toDue,
            note: `${label} মাসের চাঁদা — ${submission.transactionRef}`,
            idempotencyKey: `sub:${submission.id}:${key}:due`,
          })
        }
        if (allocation.toFine > 0) {
          ledgerRows.push({
            ...common,
            incomeCategory: 'FINE' as const,
            amountPaisa: allocation.toFine,
            note: `${label} মাসের বিলম্ব জরিমানা — ${submission.transactionRef}`,
            idempotencyKey: `sub:${submission.id}:${key}:fine`,
          })
        }

        months.push({
          dueMonth: dm.dueMonth,
          dueYear: dm.dueYear,
          label,
          duePaidPaisa: allocation.toDue,
          finePaidPaisa: allocation.toFine,
          status,
        })
      }

      if (plan.surplusPaisa > 0) {
        ledgerRows.push({
          type: 'INCOME' as const,
          incomeCategory: 'OTHER_INCOME' as const,
          amountPaisa: plan.surplusPaisa,
          memberId: submission.memberId,
          sourceSubmissionId: submission.id,
          entryDate: submission.sendingDate,
          createdById: adminId,
          note: `অতিরিক্ত জমা — ${submission.transactionRef}`,
          idempotencyKey: `sub:${submission.id}:surplus`,
        })
      }

      if (ledgerRows.length > 0) {
        await tx.transaction.createMany({ data: ledgerRows, skipDuplicates: true })
      }

      if (plan.shortfallPaisa > 0) warnings.push('UNDERPAID')
      if (plan.surplusPaisa > 0) warnings.push('OVERPAID')

      return {
        submissionId: submission.id,
        months,
        totalOwedPaisa: plan.totalOwedPaisa,
        shortfallPaisa: plan.shortfallPaisa,
        surplusPaisa: plan.surplusPaisa,
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

export type SettlementPreview = {
  months: {
    dueMonth: number
    dueYear: number
    label: string
    duePaisa: number
    finePaisa: number
    toDue: number
    toFine: number
    dueSettled: boolean
    late: boolean
  }[]
  totalOwedPaisa: number
  shortfallPaisa: number
  surplusPaisa: number
}

/**
 * What approving a submission would settle, without settling it.
 *
 * Runs the same planner the approval uses, so the review screen shows the
 * admin exactly what pressing the button will do — which months clear, which
 * fines are collected, and whether the amount falls short or runs over.
 */
export async function previewSettlement(submissionId: string): Promise<SettlementPreview | null> {
  const submission = await prisma.paymentSubmission.findUnique({
    where: { id: submissionId },
    select: {
      memberId: true,
      amountPaisa: true,
      sendingDate: true,
      dueMonth: true,
      dueYear: true,
    },
  })
  if (!submission) return null

  const target: DueMonth = { dueYear: submission.dueYear, dueMonth: submission.dueMonth }
  const sendingCivil = dbDateToCivil(submission.sendingDate)

  const [rows, claimed, setting] = await Promise.all([
    prisma.duePayment.findMany({
      where: { memberId: submission.memberId, status: { in: ['PENDING', 'UNPAID'] } },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    }),
    prisma.paymentSubmission.findMany({
      where: { memberId: submission.memberId, status: 'PENDING', id: { not: submissionId } },
      select: { dueYear: true, dueMonth: true },
    }),
    prisma.monthlyDueSetting.findUnique({
      where: { year_month: { year: target.dueYear, month: target.dueMonth } },
      select: { amountPaisa: true },
    }),
  ])

  const spokenFor = new Set(claimed.map((row) => `${row.dueYear}-${row.dueMonth}`))
  const covered = rows.filter(
    (row) =>
      compareDueMonth({ dueYear: row.year, dueMonth: row.month }, target) <= 0 &&
      !spokenFor.has(`${row.year}-${row.month}`),
  )

  const outstanding: OutstandingMonth[] = covered.map((row) => ({
    dueYear: row.year,
    dueMonth: row.month,
    duePaisa: Math.max(0, row.amountDuePaisa - row.amountPaidPaisa),
    finePaisa: fineOwedFor(
      { dueYear: row.year, dueMonth: row.month },
      sendingCivil,
      row.finePaisa,
      row.finePaidPaisa,
    ),
  }))

  if (!covered.some((row) => row.year === target.dueYear && row.month === target.dueMonth)) {
    outstanding.push({
      dueYear: target.dueYear,
      dueMonth: target.dueMonth,
      duePaisa: setting?.amountPaisa ?? 0,
      finePaisa: fineOwedFor(target, sendingCivil, 0),
    })
  }

  const plan = planSettlement(outstanding, submission.amountPaisa)

  return {
    months: plan.allocations.map((allocation) => {
      const dm = { dueYear: allocation.dueYear, dueMonth: allocation.dueMonth }
      return {
        ...dm,
        label: dueMonthLabel(dm),
        duePaisa: allocation.duePaisa,
        finePaisa: allocation.finePaisa,
        toDue: allocation.toDue,
        toFine: allocation.toFine,
        dueSettled: allocation.dueSettled,
        late: settlementStatus(sendingCivil, dm) === 'PAID_LATE',
      }
    }),
    totalOwedPaisa: plan.totalOwedPaisa,
    shortfallPaisa: plan.shortfallPaisa,
    surplusPaisa: plan.surplusPaisa,
  }
}
