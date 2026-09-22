import 'server-only'
import { prisma } from '@/lib/prisma'
import { currentDueMonth, dbDateToCivil, deadlineInstant, type CivilDate, type DueMonth } from '@/lib/due-cycle'
import { MEMBER_DEPOSIT_CATEGORIES } from '@/lib/settlement'

/**
 * Read models for the public, no-login pages.
 *
 * Everything here is visible to anyone on the internet, so each query selects
 * fields explicitly rather than returning rows wholesale. Two things are
 * deliberately never included:
 *
 *   1. **Contact details** — `mobile`, `email` and `fatherName`. Publishing a
 *      roster of names against phone numbers is an invitation to targeted fraud,
 *      and the transparency the members want does not need them.
 *   2. **Transaction references** — approval notes embed the member's bKash or
 *      bank reference (e.g. "অক্টোবর ২০২৬ মাসের চাঁদা — TXN9988"). Those are
 *      effectively payment identifiers, so the public ledger renders its own
 *      description from the category instead of echoing the stored note.
 *
 * Admin-written *expense* notes are shown, because describing what the society
 * spent money on is the entire point of the page.
 */

export type PublicSummary = {
  activeMembers: number
  totalCollectedPaisa: number
  totalDuePaisa: number
  totalFinePaisa: number
  totalOtherIncomePaisa: number
  totalExpensePaisa: number
  balancePaisa: number
  currentDue: {
    dueMonth: number
    dueYear: number
    amountPaisa: number | null
    deadlineIso: string
    paidCount: number
    unpaidCount: number
    pendingCount: number
  }
}

export async function getPublicSummary(now = new Date()): Promise<PublicSummary> {
  const current = currentDueMonth(now)

  const [activeMembers, income, expense, setting, statusCounts] = await Promise.all([
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
  ])

  const incomeOf = (category: string) =>
    income.find((row) => row.incomeCategory === category)?._sum.amountPaisa ?? 0
  const countOf = (status: string) =>
    statusCounts.find((row) => row.status === status)?._count._all ?? 0

  const totalDuePaisa = incomeOf('MONTHLY_DUE')
  const totalFinePaisa = incomeOf('FINE')
  const totalOtherIncomePaisa = incomeOf('OTHER_INCOME')
  const totalExpensePaisa = expense._sum.amountPaisa ?? 0
  const totalCollectedPaisa = totalDuePaisa + totalFinePaisa + totalOtherIncomePaisa

  return {
    activeMembers,
    totalCollectedPaisa,
    totalDuePaisa,
    totalFinePaisa,
    totalOtherIncomePaisa,
    totalExpensePaisa,
    balancePaisa: totalCollectedPaisa - totalExpensePaisa,
    currentDue: {
      dueMonth: current.dueMonth,
      dueYear: current.dueYear,
      amountPaisa: setting?.amountPaisa ?? null,
      deadlineIso: deadlineInstant(current).toISOString(),
      paidCount: countOf('PAID_ON_TIME') + countOf('PAID_LATE'),
      unpaidCount: countOf('UNPAID'),
      pendingCount: countOf('PENDING'),
    },
  }
}

export type MemberOption = { memberCode: string; name: string; photoUrl: string | null }

/**
 * The active members, for the ID selector on the public submission form.
 *
 * Deliberately light — no aggregates — because the form loads this on every
 * visit. Codes and names are already public on the member directory, so this
 * exposes nothing new.
 */
export async function getMemberOptions(): Promise<MemberOption[]> {
  return prisma.member.findMany({
    where: { isActive: true },
    select: { memberCode: true, name: true, photoUrl: true },
    orderBy: { memberCode: 'asc' },
  })
}

export type PublicMember = {
  memberCode: string
  name: string
  photoUrl: string | null
  joinedOn: CivilDate
  totalContributedPaisa: number
  currentMonthStatus: string
}

/** The member directory. Name, photo and contribution only — no contact details. */
export async function getPublicMembers(now = new Date()): Promise<PublicMember[]> {
  const current = currentDueMonth(now)

  const [members, contributions, thisMonth] = await Promise.all([
    prisma.member.findMany({
      where: { isActive: true },
      select: { id: true, memberCode: true, name: true, photoUrl: true, joinedOn: true },
      orderBy: { memberCode: 'asc' },
    }),
    prisma.transaction.groupBy({
      by: ['memberId'],
      where: {
        type: 'INCOME',
        incomeCategory: { in: MEMBER_DEPOSIT_CATEGORIES },
        voidedAt: null,
        memberId: { not: null },
      },
      _sum: { amountPaisa: true },
    }),
    prisma.duePayment.findMany({
      where: { year: current.dueYear, month: current.dueMonth },
      select: { memberId: true, status: true },
    }),
  ])

  const totalOf = new Map(contributions.map((row) => [row.memberId, row._sum.amountPaisa ?? 0]))
  const statusOf = new Map(thisMonth.map((row) => [row.memberId, row.status]))

  return members.map((member) => ({
    memberCode: member.memberCode,
    name: member.name,
    photoUrl: member.photoUrl,
    joinedOn: dbDateToCivil(member.joinedOn),
    totalContributedPaisa: totalOf.get(member.id) ?? 0,
    currentMonthStatus: statusOf.get(member.id) ?? 'PENDING',
  }))
}

export type PublicMemberProfile = {
  memberCode: string
  name: string
  photoUrl: string | null
  joinedOn: CivilDate
  totalContributedPaisa: number
  totalFinePaidPaisa: number
  outstandingFinePaisa: number
  history: {
    year: number
    month: number
    amountDuePaisa: number
    amountPaidPaisa: number
    finePaisa: number
    status: string
  }[]
}

export async function getPublicMemberProfile(
  memberCode: string,
): Promise<PublicMemberProfile | null> {
  const member = await prisma.member.findUnique({
    where: { memberCode },
    select: {
      id: true,
      memberCode: true,
      name: true,
      photoUrl: true,
      joinedOn: true,
      isActive: true,
    },
  })

  if (!member || !member.isActive) return null

  const [history, contributions] = await Promise.all([
    prisma.duePayment.findMany({
      where: { memberId: member.id },
      select: {
        year: true,
        month: true,
        amountDuePaisa: true,
        amountPaidPaisa: true,
        finePaisa: true,
        finePaidPaisa: true,
        status: true,
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    }),
    prisma.transaction.aggregate({
      where: {
        memberId: member.id,
        type: 'INCOME',
        incomeCategory: { in: MEMBER_DEPOSIT_CATEGORIES },
        voidedAt: null,
      },
      _sum: { amountPaisa: true },
    }),
  ])

  return {
    memberCode: member.memberCode,
    name: member.name,
    photoUrl: member.photoUrl,
    joinedOn: dbDateToCivil(member.joinedOn),
    totalContributedPaisa: contributions._sum.amountPaisa ?? 0,
    totalFinePaidPaisa: history.reduce((sum, row) => sum + row.finePaidPaisa, 0),
    outstandingFinePaisa: history.reduce(
      (sum, row) => sum + (row.finePaisa - row.finePaidPaisa),
      0,
    ),
    // finePaidPaisa is summed above but not published per row; the public view
    // shows the fine charged and the outstanding total.
    history: history.map((row) => ({
      year: row.year,
      month: row.month,
      amountDuePaisa: row.amountDuePaisa,
      amountPaidPaisa: row.amountPaidPaisa,
      finePaisa: row.finePaisa,
      status: row.status,
    })),
  }
}

export type PublicLedgerEntry = {
  id: string
  type: 'INCOME' | 'EXPENSE'
  category: string
  /** Rendered for the public, never the stored note on member income. */
  description: string
  amountPaisa: number
  entryDate: CivilDate
  memberCode: string | null
}

const INCOME_LABEL: Record<string, string> = {
  MONTHLY_DUE: 'মাসিক চাঁদা',
  FINE: 'বিলম্ব জরিমানা',
  OTHER_INCOME: 'অন্যান্য আয়',
}

/**
 * The public ledger, paged in the database.
 *
 * Income rows are described from their category and the member's code; the
 * stored note is discarded because it contains the member's bKash or bank
 * reference. Expense rows keep their admin-written note, which is what makes the
 * page worth reading.
 *
 * Paging happens in SQL rather than by slicing a capped result: a society of 28
 * members writes ~350 ledger rows a year, so any fixed cap would quietly start
 * hiding history.
 */
export async function getPublicLedger(
  skip = 0,
  take = 10,
): Promise<{ entries: PublicLedgerEntry[]; total: number }> {
  const where = { voidedAt: null }

  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      select: {
        id: true,
        type: true,
        incomeCategory: true,
        expenseCategoryText: true,
        expenseCategory: { select: { name: true } },
        amountPaisa: true,
        entryDate: true,
        note: true,
        member: { select: { memberCode: true } },
      },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
  ])

  const entries = rows.map((row) => {
    const isIncome = row.type === 'INCOME'
    const category = isIncome
      ? (INCOME_LABEL[row.incomeCategory ?? ''] ?? 'আয়')
      : (row.expenseCategory?.name ?? row.expenseCategoryText ?? 'ব্যয়')

    return {
      id: row.id,
      type: row.type,
      category,
      description: isIncome ? category : row.note,
      amountPaisa: row.amountPaisa,
      entryDate: dbDateToCivil(row.entryDate),
      memberCode: row.member?.memberCode ?? null,
    }
  })

  return { entries, total }
}

export type ExpenseBreakdown = { name: string; amountPaisa: number }

export async function getExpenseBreakdown(): Promise<ExpenseBreakdown[]> {
  const rows = await prisma.$queryRaw<{ name: string | null; total: bigint }[]>`
    SELECT COALESCE(ec."name", t."expense_category_text") AS name,
           SUM(t."amount_paisa")::bigint AS total
    FROM transactions t
    LEFT JOIN expense_categories ec ON ec."id" = t."expense_category_id"
    WHERE t."type" = 'EXPENSE' AND t."voided_at" IS NULL
    GROUP BY 1
    ORDER BY 2 DESC
  `

  return rows.map((row) => ({ name: row.name ?? 'অন্যান্য', amountPaisa: Number(row.total) }))
}

export type MonthlyTotals = {
  year: number
  month: number
  incomePaisa: number
  expensePaisa: number
}

/** Income and expense per calendar month, most recent first, paged in SQL. */
export async function getMonthlyTotals(
  skip = 0,
  take = 10,
): Promise<{ months: MonthlyTotals[]; total: number }> {
  const [counted] = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*)::bigint AS total FROM (
      SELECT 1 FROM transactions
      WHERE "voided_at" IS NULL
      GROUP BY EXTRACT(YEAR FROM "entry_date"), EXTRACT(MONTH FROM "entry_date")
    ) AS grouped
  `

  const rows = await prisma.$queryRaw<
    { y: number; m: number; income: bigint; expense: bigint }[]
  >`
    SELECT EXTRACT(YEAR  FROM "entry_date")::int AS y,
           EXTRACT(MONTH FROM "entry_date")::int AS m,
           SUM("amount_paisa") FILTER (WHERE "type" = 'INCOME')::bigint  AS income,
           SUM("amount_paisa") FILTER (WHERE "type" = 'EXPENSE')::bigint AS expense
    FROM transactions
    WHERE "voided_at" IS NULL
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2 DESC
    LIMIT ${take} OFFSET ${skip}
  `

  return {
    total: Number(counted?.total ?? 0),
    months: rows.map((row) => ({
      year: row.y,
      month: row.m,
      incomePaisa: Number(row.income ?? 0),
      expensePaisa: Number(row.expense ?? 0),
    })),
  }
}

export type DueMonthSummary = { dueMonth: DueMonth; collectedPaisa: number; paidCount: number; totalCount: number }

export type SubmissionReceipt = {
  memberCode: string
  name: string
  photoUrl: string | null
  dueMonth: number
  dueYear: number
  sendingDate: CivilDate
  amountPaisa: number
  transactionRef: string
  paymentMedium: string
  bankName: string | null
  mobileBankingProvider: string | null
  mobileBankingNumber: string | null
  screenshotUrl: string
  status: string
  submittedAt: Date
  rejectionReason: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The receipt shown straight after the public form is submitted, so a member
 * can see their own entry landed and check they picked the right ID.
 *
 * Addressed by the submission's own id — a v4 uuid, so it cannot be guessed or
 * walked, which is what lets the page work with no login. It returns only what
 * the submitter just typed in themselves, plus the photo and name already
 * public on the member directory. Nothing about the review is exposed beyond
 * the status and, if there is one, the reason it was turned down: the member is
 * entitled to both, and neither identifies the reviewer.
 */
export async function getSubmissionReceipt(id: string): Promise<SubmissionReceipt | null> {
  // Guarded before the query: Postgres rejects a malformed uuid outright, and a
  // mistyped link should be a friendly page, not a 500.
  if (!UUID.test(id)) return null

  const row = await prisma.paymentSubmission.findUnique({
    where: { id },
    select: {
      name: true,
      memberCodeSnapshot: true,
      dueMonth: true,
      dueYear: true,
      sendingDate: true,
      amountPaisa: true,
      transactionRef: true,
      paymentMedium: true,
      bankName: true,
      mobileBankingProvider: true,
      mobileBankingNumber: true,
      screenshotUrl: true,
      status: true,
      createdAt: true,
      rejectionReason: true,
      member: { select: { photoUrl: true } },
    },
  })

  if (!row) return null

  return {
    memberCode: row.memberCodeSnapshot,
    name: row.name,
    photoUrl: row.member?.photoUrl ?? null,
    dueMonth: row.dueMonth,
    dueYear: row.dueYear,
    sendingDate: dbDateToCivil(row.sendingDate),
    amountPaisa: row.amountPaisa,
    transactionRef: row.transactionRef,
    paymentMedium: row.paymentMedium,
    bankName: row.bankName,
    mobileBankingProvider: row.mobileBankingProvider,
    mobileBankingNumber: row.mobileBankingNumber,
    screenshotUrl: row.screenshotUrl,
    status: row.status,
    submittedAt: row.createdAt,
    rejectionReason: row.rejectionReason,
  }
}
