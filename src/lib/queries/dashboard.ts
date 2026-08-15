import 'server-only'
import { prisma } from '@/lib/prisma'
import { currentDueMonth, deadlineInstant, type DueMonth } from '@/lib/due-cycle'

export type DashboardData = {
  activeMembers: number
  totalDueCollectedPaisa: number
  totalFinesCollectedPaisa: number
  totalOtherIncomePaisa: number
  totalExpensePaisa: number
  balancePaisa: number
  finesOutstandingPaisa: number
  currentDue: {
    dueMonth: number
    dueYear: number
    amountPaisa: number | null
    deadlineIso: string
    paidCount: number
    pendingCount: number
    unpaidCount: number
  }
  pendingSubmissionCount: number
  missingDueSettings: DueMonth[]
}

/**
 * Every income figure sums *voided-excluded* transactions, which is what makes
 * a correction actually correct the dashboard.
 *
 * Fines are counted from the ledger (money received), not from
 * DuePayment.finePaisa (money charged) — a levied fine is a receivable. The
 * outstanding figure is reported separately.
 */
export async function getDashboard(now = new Date()): Promise<DashboardData> {
  const current = currentDueMonth(now)

  const [
    activeMembers,
    incomeByCategory,
    expenseTotal,
    dueSetting,
    duePaymentCounts,
    fineCharged,
    finePaid,
    pendingSubmissionCount,
    settingsNearby,
  ] = await Promise.all([
    prisma.member.count({ where: { isActive: true } }),

    prisma.transaction.groupBy({
      by: ['incomeCategory'],
      where: { type: 'INCOME', voidedAt: null },
      _sum: { amountPaisa: true },
    }),

    prisma.transaction.aggregate({
      where: { type: 'EXPENSE', voidedAt: null },
      _sum: { amountPaisa: true },
    }),

    prisma.monthlyDueSetting.findUnique({
      where: { year_month: { year: current.dueYear, month: current.dueMonth } },
      select: { amountPaisa: true },
    }),

    prisma.duePayment.groupBy({
      by: ['status'],
      where: { year: current.dueYear, month: current.dueMonth },
      _count: { _all: true },
    }),

    prisma.duePayment.aggregate({ _sum: { finePaisa: true } }),
    prisma.duePayment.aggregate({ _sum: { finePaidPaisa: true } }),

    prisma.paymentSubmission.count({ where: { status: 'PENDING' } }),

    prisma.monthlyDueSetting.findMany({
      where: {
        OR: [
          { year: current.dueYear, month: current.dueMonth },
          { year: current.dueYear, month: current.dueMonth + 1 },
        ],
      },
      select: { year: true, month: true },
    }),
  ])

  const incomeOf = (category: string) =>
    incomeByCategory.find((row) => row.incomeCategory === category)?._sum.amountPaisa ?? 0

  const totalDueCollectedPaisa = incomeOf('MONTHLY_DUE')
  const totalFinesCollectedPaisa = incomeOf('FINE')
  const totalOtherIncomePaisa = incomeOf('OTHER_INCOME')
  const totalExpensePaisa = expenseTotal._sum.amountPaisa ?? 0

  const countOf = (status: string) =>
    duePaymentCounts.find((row) => row.status === status)?._count._all ?? 0

  const present = new Set(settingsNearby.map((s) => `${s.year}-${s.month}`))
  const missingDueSettings: DueMonth[] = []
  for (const dm of [current, nextMonth(current)]) {
    if (!present.has(`${dm.dueYear}-${dm.dueMonth}`)) missingDueSettings.push(dm)
  }

  return {
    activeMembers,
    totalDueCollectedPaisa,
    totalFinesCollectedPaisa,
    totalOtherIncomePaisa,
    totalExpensePaisa,
    balancePaisa:
      totalDueCollectedPaisa + totalFinesCollectedPaisa + totalOtherIncomePaisa - totalExpensePaisa,
    finesOutstandingPaisa: (fineCharged._sum.finePaisa ?? 0) - (finePaid._sum.finePaidPaisa ?? 0),
    currentDue: {
      dueMonth: current.dueMonth,
      dueYear: current.dueYear,
      amountPaisa: dueSetting?.amountPaisa ?? null,
      deadlineIso: deadlineInstant(current).toISOString(),
      paidCount: countOf('PAID_ON_TIME') + countOf('PAID_LATE'),
      pendingCount: countOf('PENDING'),
      unpaidCount: countOf('UNPAID'),
    },
    pendingSubmissionCount,
    missingDueSettings,
  }
}

function nextMonth(dm: DueMonth): DueMonth {
  return dm.dueMonth === 12
    ? { dueYear: dm.dueYear + 1, dueMonth: 1 }
    : { dueYear: dm.dueYear, dueMonth: dm.dueMonth + 1 }
}
