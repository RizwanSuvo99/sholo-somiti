import 'server-only'
import { prisma } from '@/lib/prisma'
import {
  civilToDbDate,
  currentDueMonth,
  dbDateToCivil,
  dueMonthForCivilDate,
  dueMonthKey,
  dueMonthsBetween,
  dueWindow,
  ordinal,
  type CivilDate,
  type DueMonth,
} from '@/lib/due-cycle'

/**
 * One line of the monthly submission report.
 *
 * A member who sent nothing in the cycle still gets a row, with `submitted`
 * false and every payment field null — the report has to answer "who did not
 * pay" as plainly as "who did", and a missing row answers nothing.
 *
 * `dueMonth` is the month the payment was *for*, which is not always the cycle
 * the report covers: a member paying October's চাঁদা on 25 October sent the money
 * inside November's cycle, so the row lands in November's report and names
 * October here.
 */
export type SubmissionReportRow = {
  memberCode: string
  name: string
  fatherName: string | null
  mobile: string | null
  email: string | null
  submitted: boolean
  dueMonth: DueMonth | null
  sendingDate: CivilDate | null
  submittedAt: Date | null
  reviewedAt: Date | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  amountPaisa: number | null
  paymentMedium: string | null
  bankOrProvider: string | null
  senderNumber: string | null
  transactionRef: string | null
  screenshotUrl: string | null
  rejectionReason: string | null
}

export type SubmissionCycleReport = {
  cycle: DueMonth
  startCivil: CivilDate
  endCivil: CivilDate
  rows: SubmissionReportRow[]
  /** Distinct members who sent something in the cycle, however many times. */
  submittedCount: number
  /** Members on the roster who sent nothing. */
  missingCount: number
}

const MEMBER_FIELDS = {
  id: true,
  memberCode: true,
  name: true,
  fatherName: true,
  mobile: true,
  email: true,
} as const

const SUBMISSION_FIELDS = {
  id: true,
  memberId: true,
  dueYear: true,
  dueMonth: true,
  sendingDate: true,
  createdAt: true,
  reviewedAt: true,
  status: true,
  amountPaisa: true,
  paymentMedium: true,
  bankName: true,
  mobileBankingProvider: true,
  mobileBankingNumber: true,
  transactionRef: true,
  screenshotUrl: true,
  rejectionReason: true,
} as const

/**
 * Who was on the roster for a cycle: everyone who had joined by the day the
 * window closed and had not already left before it opened. Anyone who actually
 * submitted inside the window is included regardless, so a submission can never
 * fall out of its own report.
 */
function rosterWhere(start: Date, end: Date) {
  return {
    OR: [
      {
        joinedOn: { lte: end },
        OR: [{ deactivatedOn: null }, { deactivatedOn: { gte: start } }],
      },
      { submissions: { some: { sendingDate: { gte: start, lte: end } } } },
    ],
  }
}

export async function getSubmissionCycleReport(cycle: DueMonth): Promise<SubmissionCycleReport> {
  const { startCivil, endCivil } = dueWindow(cycle)
  const start = civilToDbDate(startCivil)
  const end = civilToDbDate(endCivil)

  const [members, submissions] = await Promise.all([
    prisma.member.findMany({
      where: rosterWhere(start, end),
      orderBy: { memberCode: 'asc' },
      select: MEMBER_FIELDS,
    }),
    prisma.paymentSubmission.findMany({
      where: { sendingDate: { gte: start, lte: end } },
      orderBy: [{ sendingDate: 'asc' }, { createdAt: 'asc' }],
      select: SUBMISSION_FIELDS,
    }),
  ])

  const byMember = new Map<string, typeof submissions>()
  for (const submission of submissions) {
    const list = byMember.get(submission.memberId)
    if (list) list.push(submission)
    else byMember.set(submission.memberId, [submission])
  }

  const rows: SubmissionReportRow[] = []
  let submittedCount = 0
  let missingCount = 0

  for (const member of members) {
    const identity = {
      memberCode: member.memberCode,
      name: member.name,
      fatherName: member.fatherName,
      mobile: member.mobile,
      email: member.email,
    }

    const sent = byMember.get(member.id) ?? []

    if (sent.length === 0) {
      missingCount += 1
      rows.push({
        ...identity,
        submitted: false,
        dueMonth: null,
        sendingDate: null,
        submittedAt: null,
        reviewedAt: null,
        status: null,
        amountPaisa: null,
        paymentMedium: null,
        bankOrProvider: null,
        senderNumber: null,
        transactionRef: null,
        screenshotUrl: null,
        rejectionReason: null,
      })
      continue
    }

    // One row per submission: paying two months in one cycle is legitimate, and
    // collapsing them would hide one of the payments.
    submittedCount += 1
    for (const s of sent) {
      rows.push({
        ...identity,
        submitted: true,
        dueMonth: { dueYear: s.dueYear, dueMonth: s.dueMonth },
        sendingDate: dbDateToCivil(s.sendingDate),
        submittedAt: s.createdAt,
        reviewedAt: s.reviewedAt,
        status: s.status,
        amountPaisa: s.amountPaisa,
        paymentMedium: s.paymentMedium,
        bankOrProvider: s.bankName ?? s.mobileBankingProvider ?? null,
        senderNumber: s.mobileBankingNumber,
        transactionRef: s.transactionRef,
        screenshotUrl: s.screenshotUrl,
        rejectionReason: s.rejectionReason,
      })
    }
  }

  return { cycle, startCivil, endCivil, rows, submittedCount, missingCount }
}

export type SubmissionCycleSummary = {
  cycle: DueMonth
  startCivil: CivilDate
  endCivil: CivilDate
  rosterCount: number
  submittedCount: number
  missingCount: number
}

/**
 * Every cycle the society has records for, newest first, with the counts the
 * report page shows before you download anything.
 *
 * Counts are worked out in memory rather than with a query per cycle: the
 * society is tens of members and tens of submissions, and a sending date maps
 * to exactly one cycle, so bucketing is both cheaper and easier to read.
 */
export async function listSubmissionCycles(
  now: Date = new Date(),
): Promise<SubmissionCycleSummary[]> {
  const [members, submissions, earliestDue] = await Promise.all([
    prisma.member.findMany({
      orderBy: { memberCode: 'asc' },
      select: { id: true, joinedOn: true, deactivatedOn: true },
    }),
    prisma.paymentSubmission.findMany({ select: { memberId: true, sendingDate: true } }),
    prisma.duePayment.findFirst({
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
      select: { year: true, month: true },
    }),
  ])

  const current = currentDueMonth(now)

  const sentCycles = submissions.map((s) => dueMonthForCivilDate(dbDateToCivil(s.sendingDate)))

  // Anchored on real records only. With no dues and no submissions the society
  // has nothing to report, and offering the open cycle would be empty noise.
  const anchors = [
    ...(earliestDue ? [{ dueYear: earliestDue.year, dueMonth: earliestDue.month }] : []),
    ...sentCycles,
  ]
  if (anchors.length === 0) return []

  const index = (dm: DueMonth) => dm.dueYear * 12 + dm.dueMonth
  const first = anchors.reduce((a, b) => (index(a) <= index(b) ? a : b))
  const last = [...anchors, current].reduce((a, b) => (index(a) >= index(b) ? a : b))

  const sentMembersByCycle = new Map<string, Set<string>>()
  submissions.forEach((s, index) => {
    const key = dueMonthKey(sentCycles[index])
    const set = sentMembersByCycle.get(key)
    if (set) set.add(s.memberId)
    else sentMembersByCycle.set(key, new Set([s.memberId]))
  })

  const roster = members.map((m) => ({
    id: m.id,
    joined: ordinal(dbDateToCivil(m.joinedOn)),
    left: m.deactivatedOn ? ordinal(dbDateToCivil(m.deactivatedOn)) : null,
  }))

  return dueMonthsBetween(first, last)
    .map((cycle) => {
      const { startCivil, endCivil } = dueWindow(cycle)
      const start = ordinal(startCivil)
      const end = ordinal(endCivil)
      const sent = sentMembersByCycle.get(dueMonthKey(cycle)) ?? new Set<string>()

      const onRoster = roster.filter(
        (m) => m.joined <= end && (m.left === null || m.left >= start),
      )
      const rosterIds = new Set(onRoster.map((m) => m.id))
      for (const id of sent) rosterIds.add(id)

      return {
        cycle,
        startCivil,
        endCivil,
        rosterCount: rosterIds.size,
        submittedCount: sent.size,
        missingCount: rosterIds.size - sent.size,
      }
    })
    .reverse()
}
