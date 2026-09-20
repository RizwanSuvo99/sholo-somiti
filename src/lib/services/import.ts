import 'server-only'
import { prisma } from '@/lib/prisma'
import {
  civilToDbDate,
  compareDueMonth,
  currentDueMonth,
  dueWindow,
  type DueMonth,
} from '@/lib/due-cycle'
import { dueMonthLabel } from '@/lib/bn'
import { AppError, conflict, notFound } from '@/lib/api/errors'
import { COLLECTION_START } from '@/lib/society'

/**
 * Backfilling last year's records.
 *
 * Both modes write through a HistoricalImport batch and tag every row they
 * create with its id, so an admin can see exactly what a run touched — and so a
 * mistaken batch can be identified and reversed.
 */

/**
 * Reject a month the society never collected for.
 *
 * The pickers already hide these, but this endpoint is reachable directly and a
 * backdated row in the ledger is not something to discover months later.
 */
function assertImportableMonth(dm: DueMonth, now = new Date()): void {
  if (compareDueMonth(dm, COLLECTION_START) < 0) {
    throw new AppError(
      'VALIDATION_FAILED',
      422,
      'Month precedes the first collection month',
      `${dueMonthLabel(COLLECTION_START)} থেকে সমিতির হিসাব শুরু — এর আগের মাস যোগ করা যাবে না`,
    )
  }

  const current = currentDueMonth(now)
  if (compareDueMonth(dm, current) > 0) {
    throw new AppError(
      'VALIDATION_FAILED',
      422,
      'Month is in the future',
      'ভবিষ্যতের মাসের হিসাব যোগ করা যাবে না',
    )
  }
}

/** Mode 1: a fine for one member, for one past month. */
export async function importMemberFine(
  input: { memberCode: string; month: number; year: number; amountPaisa: number; note?: string },
  adminId: string,
) {
  const dm: DueMonth = { dueYear: input.year, dueMonth: input.month }
  assertImportableMonth(dm)

  const member = await prisma.member.findUnique({
    where: { memberCode: input.memberCode },
    select: { id: true, memberCode: true, name: true },
  })
  if (!member) throw notFound('Member', 'সদস্য')
  const entryDate = civilToDbDate(dueWindow(dm).endCivil)

  return prisma.$transaction(async (tx) => {
    const batch = await tx.historicalImport.create({
      data: {
        kind: 'FINE_IMPORT',
        description:
          input.note ?? `${member.memberCode} — ${dueMonthLabel(dm)} মাসের জরিমানা (পুরোনো হিসাব)`,
        month: input.month,
        year: input.year,
        amountPaisa: input.amountPaisa,
        affectedCount: 1,
        performedById: adminId,
      },
    })

    // The fine is recorded as received money, because a historical import is a
    // record of what was actually collected.
    await tx.transaction.create({
      data: {
        type: 'INCOME',
        incomeCategory: 'FINE',
        amountPaisa: input.amountPaisa,
        memberId: member.id,
        importBatchId: batch.id,
        note: batch.description,
        entryDate,
        createdById: adminId,
        idempotencyKey: `import:${batch.id}:${member.id}:fine`,
      },
    })

    // Keep the member's month-by-month view consistent with the ledger, if a
    // row for that month exists.
    const existing = await tx.duePayment.findUnique({
      where: { memberId_year_month: { memberId: member.id, year: input.year, month: input.month } },
      select: { id: true, finePaisa: true, finePaidPaisa: true },
    })

    if (existing) {
      await tx.duePayment.update({
        where: { id: existing.id },
        data: {
          finePaisa: Math.max(existing.finePaisa, input.amountPaisa),
          finePaidPaisa: existing.finePaidPaisa + input.amountPaisa,
          importBatchId: batch.id,
        },
      })
    }

    return { batchId: batch.id, member, affected: 1 }
  })
}

/**
 * Mode 2: one amount applied to every active member for a past month, in a
 * single action rather than 28 repetitions.
 */
export async function importUniformDue(
  input: { month: number; year: number; amountPaisa: number; note?: string },
  adminId: string,
) {
  const dm: DueMonth = { dueYear: input.year, dueMonth: input.month }
  assertImportableMonth(dm)

  // One uniform import per month. Running it twice would not double the ledger
  // (the idempotency keys prevent that), but it would silently overwrite the
  // amount on every member's row, so it is refused outright.
  const already = await prisma.historicalImport.findFirst({
    where: { kind: 'UNIFORM_DUE_IMPORT', year: input.year, month: input.month },
    select: { id: true },
  })
  if (already) {
    throw conflict(
      'CONFLICT',
      'This month has already been imported',
      `${dueMonthLabel(dm)} মাসের চাঁদা ইতিমধ্যে যোগ করা হয়েছে`,
    )
  }

  const windowEnd = civilToDbDate(dueWindow(dm).endCivil)
  const windowStart = civilToDbDate(dueWindow(dm).startCivil)

  return prisma.$transaction(async (tx) => {
    const members = await tx.member.findMany({
      where: { isActive: true, joinedOn: { lte: windowStart } },
      select: { id: true },
    })

    const batch = await tx.historicalImport.create({
      data: {
        kind: 'UNIFORM_DUE_IMPORT',
        description: input.note ?? `${dueMonthLabel(dm)} মাসের চাঁদা (পুরোনো হিসাব)`,
        month: input.month,
        year: input.year,
        amountPaisa: input.amountPaisa,
        affectedCount: members.length,
        performedById: adminId,
      },
    })

    for (const member of members) {
      await tx.duePayment.upsert({
        where: {
          memberId_year_month: { memberId: member.id, year: input.year, month: input.month },
        },
        create: {
          memberId: member.id,
          year: input.year,
          month: input.month,
          amountDuePaisa: input.amountPaisa,
          amountPaidPaisa: input.amountPaisa,
          paidAt: windowEnd,
          status: 'PAID_ON_TIME',
          importBatchId: batch.id,
        },
        update: {
          amountDuePaisa: input.amountPaisa,
          amountPaidPaisa: input.amountPaisa,
          paidAt: windowEnd,
          status: 'PAID_ON_TIME',
          importBatchId: batch.id,
        },
      })
    }

    // One ledger row per member, each with a deterministic key so re-importing
    // the same batch cannot double the income.
    await tx.transaction.createMany({
      skipDuplicates: true,
      data: members.map((member) => ({
        type: 'INCOME' as const,
        incomeCategory: 'MONTHLY_DUE' as const,
        amountPaisa: input.amountPaisa,
        memberId: member.id,
        importBatchId: batch.id,
        note: batch.description,
        entryDate: windowEnd,
        createdById: adminId,
        idempotencyKey: `import:${batch.id}:${member.id}:due`,
      })),
    })

    return { batchId: batch.id, affected: members.length }
  })
}
