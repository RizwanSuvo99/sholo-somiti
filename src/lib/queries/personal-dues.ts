import 'server-only'
import { prisma } from '@/lib/prisma'
import { dbDateToCivil, ordinal, type CivilDate } from '@/lib/due-cycle'

/**
 * Read side of the admin's private lending book.
 *
 * Reads only `personal_loans` and `personal_repayments` (plus members, for the
 * ID and name the admin recognises). No society table is touched, so no figure
 * on this page can drift because of a change to the society's accounts.
 */

export type PersonalDebtorRow = {
  memberId: string
  memberCode: string
  name: string
  photoUrl: string | null
  mobile: string | null
  isActive: boolean
  /** Total handed over, across every loan entry. */
  loanPaisa: number
  /** Total taken back, across every installment. */
  paidPaisa: number
  /** `loanPaisa − paidPaisa`. Never negative: the service refuses overpayment. */
  remainingPaisa: number
  loanCount: number
  repaymentCount: number
  /** The most recent day anything happened, either direction. */
  lastActivity: CivilDate | null
}

export type PersonalDueSummary = {
  /** People who still owe something. */
  debtorCount: number
  /** People with any record at all, settled or not. */
  memberCount: number
  totalReceivablePaisa: number
  totalCollectedPaisa: number
  totalOutstandingPaisa: number
}

function laterOf(a: CivilDate | null, b: CivilDate | null): CivilDate | null {
  if (!a) return b
  if (!b) return a
  return ordinal(a) >= ordinal(b) ? a : b
}

/**
 * Both totals for every member who appears in the book, in one pass.
 *
 * Grouped in the database rather than pulled row by row, so the page cost does
 * not grow with the number of installments recorded.
 */
async function buildRows(): Promise<PersonalDebtorRow[]> {
  const [lent, repaid] = await Promise.all([
    prisma.personalLoan.groupBy({
      by: ['memberId'],
      _sum: { amountPaisa: true },
      _count: { _all: true },
      _max: { lentOn: true },
    }),
    prisma.personalRepayment.groupBy({
      by: ['memberId'],
      _sum: { amountPaisa: true },
      _count: { _all: true },
      _max: { paidOn: true },
    }),
  ])

  const memberIds = [...new Set([...lent, ...repaid].map((row) => row.memberId))]
  if (memberIds.length === 0) return []

  const members = await prisma.member.findMany({
    where: { id: { in: memberIds } },
    select: {
      id: true,
      memberCode: true,
      name: true,
      photoUrl: true,
      mobile: true,
      isActive: true,
    },
  })

  const lentBy = new Map(lent.map((row) => [row.memberId, row]))
  const repaidBy = new Map(repaid.map((row) => [row.memberId, row]))

  const rows = members.map((member): PersonalDebtorRow => {
    const loans = lentBy.get(member.id)
    const repayments = repaidBy.get(member.id)

    const loanPaisa = loans?._sum.amountPaisa ?? 0
    const paidPaisa = repayments?._sum.amountPaisa ?? 0

    return {
      memberId: member.id,
      memberCode: member.memberCode,
      name: member.name,
      photoUrl: member.photoUrl,
      mobile: member.mobile,
      isActive: member.isActive,
      loanPaisa,
      paidPaisa,
      remainingPaisa: loanPaisa - paidPaisa,
      loanCount: loans?._count._all ?? 0,
      repaymentCount: repayments?._count._all ?? 0,
      lastActivity: laterOf(
        loans?._max.lentOn ? dbDateToCivil(loans._max.lentOn) : null,
        repayments?._max.paidOn ? dbDateToCivil(repayments._max.paidOn) : null,
      ),
    }
  })

  // Biggest balance first, so whoever owes most is at the top; people who have
  // settled fall to the bottom rather than disappearing, because the admin
  // still wants to see that they paid.
  return rows.sort(
    (a, b) => b.remainingPaisa - a.remainingPaisa || a.memberCode.localeCompare(b.memberCode),
  )
}

/** Pure, so the headline figures can be checked without a database. */
export function summarizePersonalDues(rows: readonly PersonalDebtorRow[]): PersonalDueSummary {
  return rows.reduce<PersonalDueSummary>(
    (summary, row) => ({
      debtorCount: summary.debtorCount + (row.remainingPaisa > 0 ? 1 : 0),
      memberCount: summary.memberCount + 1,
      totalReceivablePaisa: summary.totalReceivablePaisa + row.loanPaisa,
      totalCollectedPaisa: summary.totalCollectedPaisa + row.paidPaisa,
      totalOutstandingPaisa: summary.totalOutstandingPaisa + row.remainingPaisa,
    }),
    {
      debtorCount: 0,
      memberCount: 0,
      totalReceivablePaisa: 0,
      totalCollectedPaisa: 0,
      totalOutstandingPaisa: 0,
    },
  )
}

export async function listPersonalDebtors(): Promise<PersonalDebtorRow[]> {
  return buildRows()
}

export async function getPersonalDueSummary(): Promise<PersonalDueSummary> {
  return summarizePersonalDues(await buildRows())
}

/** Both the list and the tiles from a single pass, for the page that needs both. */
export async function getPersonalDueBook(): Promise<{
  rows: PersonalDebtorRow[]
  summary: PersonalDueSummary
}> {
  const rows = await buildRows()
  return { rows, summary: summarizePersonalDues(rows) }
}

export type PersonalLoanEntry = {
  id: string
  amountPaisa: number
  lentOn: CivilDate
  note: string | null
}

export type PersonalRepaymentEntry = {
  id: string
  amountPaisa: number
  paidOn: CivilDate
  note: string | null
}

export type PersonalDueDetail = {
  member: {
    id: string
    memberCode: string
    name: string
    fatherName: string | null
    photoUrl: string | null
    mobile: string | null
    isActive: boolean
  }
  loanPaisa: number
  paidPaisa: number
  remainingPaisa: number
  loans: PersonalLoanEntry[]
  repayments: PersonalRepaymentEntry[]
}

/**
 * One person's page. `null` when they have no personal record — including after
 * their last entry is deleted, so the detail page can 404 instead of showing an
 * empty shell for somebody who was never part of this book.
 */
export async function getPersonalDueDetail(memberId: string): Promise<PersonalDueDetail | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      memberCode: true,
      name: true,
      fatherName: true,
      photoUrl: true,
      mobile: true,
      isActive: true,
    },
  })
  if (!member) return null

  const [loans, repayments] = await Promise.all([
    prisma.personalLoan.findMany({
      where: { memberId },
      orderBy: [{ lentOn: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, amountPaisa: true, lentOn: true, note: true },
    }),
    prisma.personalRepayment.findMany({
      where: { memberId },
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, amountPaisa: true, paidOn: true, note: true },
    }),
  ])

  if (loans.length === 0 && repayments.length === 0) return null

  const loanPaisa = loans.reduce((total, loan) => total + loan.amountPaisa, 0)
  const paidPaisa = repayments.reduce((total, row) => total + row.amountPaisa, 0)

  return {
    member,
    loanPaisa,
    paidPaisa,
    remainingPaisa: loanPaisa - paidPaisa,
    loans: loans.map((loan) => ({
      id: loan.id,
      amountPaisa: loan.amountPaisa,
      lentOn: dbDateToCivil(loan.lentOn),
      note: loan.note,
    })),
    repayments: repayments.map((row) => ({
      id: row.id,
      amountPaisa: row.amountPaisa,
      paidOn: dbDateToCivil(row.paidOn),
      note: row.note,
    })),
  }
}
