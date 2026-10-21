import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDatabase } from '../helpers/db'
import { makeMember, makeSubmission, resetFactorySequence } from '../helpers/factories'
import { getSubmissionCycleReport, listSubmissionCycles } from '@/lib/queries/reports'
import { generateDuePayments } from '@/lib/services/dues'
import { renderSubmissionWorkbook } from '@/lib/reports/submission-sheet'
import { dhakaCivilToInstant, parseCivilDate, type DueMonth } from '@/lib/due-cycle'

const SEPTEMBER: DueMonth = { dueYear: 2026, dueMonth: 9 }
const OCTOBER: DueMonth = { dueYear: 2026, dueMonth: 10 }
const NOVEMBER: DueMonth = { dueYear: 2026, dueMonth: 11 }

/** 18 October 2026 — inside October's cycle. */
const midOctober = dhakaCivilToInstant(parseCivilDate('2026-10-18'), 10, 0)

const codesIn = (rows: { memberCode: string }[]) => rows.map((r) => r.memberCode)

describe('monthly submission report', () => {
  beforeEach(async () => {
    await resetDatabase()
    resetFactorySequence()
  })

  it('covers 21st to 20th, the cycle the money was sent in', async () => {
    const report = await getSubmissionCycleReport(OCTOBER)

    expect(report.startCivil).toEqual({ y: 2026, m: 9, d: 21 })
    expect(report.endCivil).toEqual({ y: 2026, m: 10, d: 20 })
  })

  it('lists a member who sent nothing, so the report answers who did not pay', async () => {
    const paid = await makeMember({ name: 'জমা দিয়েছেন' })
    await makeMember({ name: 'জমা দেননি' })
    await makeSubmission(paid.id, paid.memberCode, OCTOBER, { sendingDate: '2026-10-12' })

    const report = await getSubmissionCycleReport(OCTOBER)

    expect(report.rows).toHaveLength(2)
    expect(report.submittedCount).toBe(1)
    expect(report.missingCount).toBe(1)

    const missing = report.rows.find((r) => !r.submitted)
    expect(missing?.name).toBe('জমা দেননি')
    expect(missing?.sendingDate).toBeNull()
    expect(missing?.screenshotUrl).toBeNull()
  })

  it("puts a late payment in the cycle it was sent in, not the month it pays", async () => {
    const member = await makeMember()
    // October's চাঁদা, sent five days after October's window closed.
    await makeSubmission(member.id, member.memberCode, OCTOBER, { sendingDate: '2026-10-25' })

    const october = await getSubmissionCycleReport(OCTOBER)
    const november = await getSubmissionCycleReport(NOVEMBER)

    expect(october.submittedCount).toBe(0)
    expect(october.rows[0].submitted).toBe(false)

    expect(november.submittedCount).toBe(1)
    expect(november.rows[0].sendingDate).toEqual({ y: 2026, m: 10, d: 25 })
    // The row still names the month it actually pays for.
    expect(november.rows[0].dueMonth).toEqual(OCTOBER)
  })

  it.each([
    ['2026-09-20', 'before', false],
    ['2026-09-21', 'first day', true],
    ['2026-10-20', 'last day', true],
    ['2026-10-21', 'after', false],
  ])('a payment sent %s (%s) is in October: %s', async (date, _label, inside) => {
    const member = await makeMember()
    await makeSubmission(member.id, member.memberCode, OCTOBER, { sendingDate: date })

    const report = await getSubmissionCycleReport(OCTOBER)
    expect(report.submittedCount).toBe(inside ? 1 : 0)
  })

  it('gives a member one row per payment when they settle two months at once', async () => {
    const member = await makeMember()
    await makeSubmission(member.id, member.memberCode, SEPTEMBER, { sendingDate: '2026-10-05' })
    await makeSubmission(member.id, member.memberCode, OCTOBER, { sendingDate: '2026-10-05' })

    const report = await getSubmissionCycleReport(OCTOBER)

    expect(report.rows).toHaveLength(2)
    expect(report.rows.map((r) => r.dueMonth)).toEqual([SEPTEMBER, OCTOBER])
    // Counted once as a person, twice as payments.
    expect(report.submittedCount).toBe(1)
    expect(report.missingCount).toBe(0)
  })

  it('leaves out a member who had not joined by the time the cycle closed', async () => {
    const early = await makeMember({ joinedOn: '2025-01-01', name: 'পুরোনো' })
    await makeMember({ joinedOn: '2026-11-01', name: 'পরে যোগ' })

    const report = await getSubmissionCycleReport(OCTOBER)

    expect(codesIn(report.rows)).toEqual([early.memberCode])
  })

  it('still reports a rejected payment as submitted, with its reason', async () => {
    const member = await makeMember()
    const submission = await makeSubmission(member.id, member.memberCode, OCTOBER, {
      sendingDate: '2026-10-12',
    })
    await prisma.paymentSubmission.update({
      where: { id: submission.id },
      data: { status: 'REJECTED', rejectionReason: 'ছবি স্পষ্ট নয়' },
    })

    const report = await getSubmissionCycleReport(OCTOBER)

    expect(report.rows[0].submitted).toBe(true)
    expect(report.rows[0].status).toBe('REJECTED')
    expect(report.rows[0].rejectionReason).toBe('ছবি স্পষ্ট নয়')
  })

  it('carries every contact detail the report needs', async () => {
    const member = await makeMember()
    await prisma.member.update({
      where: { id: member.id },
      data: { fatherName: 'পিতার নাম', mobile: '01700000000', email: 'a@b.test' },
    })
    await makeSubmission(member.id, member.memberCode, OCTOBER, { sendingDate: '2026-10-12' })

    const [row] = (await getSubmissionCycleReport(OCTOBER)).rows

    expect(row.fatherName).toBe('পিতার নাম')
    expect(row.mobile).toBe('01700000000')
    expect(row.email).toBe('a@b.test')
    expect(row.screenshotUrl).toBe('https://res.cloudinary.com/demo/image/upload/v1/sholo/proof.jpg')
    expect(row.transactionRef).toBeTruthy()
    expect(row.bankOrProvider).toBe('BKASH')
  })

  it('renders a real .xlsx the writer accepts', async () => {
    const member = await makeMember()
    await makeMember({ name: 'জমা দেননি' })
    await makeSubmission(member.id, member.memberCode, OCTOBER, { sendingDate: '2026-10-12' })

    const workbook = await renderSubmissionWorkbook(await getSubmissionCycleReport(OCTOBER))

    // 'PK' is the zip magic every .xlsx starts with. The cell contents are
    // asserted in the unit tests; what matters here is that the writer accepts
    // every cell shape the query produces, including the empty ones.
    expect(workbook.subarray(0, 2).toString()).toBe('PK')
    expect(workbook.length).toBeGreaterThan(1_000)
  })

  describe('the list of cycles to choose from', () => {
    it('runs newest first up to the open cycle, counting each one', async () => {
      const a = await makeMember({ joinedOn: '2025-01-01' })
      await makeMember({ joinedOn: '2025-01-01' })
      // Billing September is what makes the society's records start there.
      await generateDuePayments(SEPTEMBER)
      await makeSubmission(a.id, a.memberCode, OCTOBER, { sendingDate: '2026-10-12' })

      const cycles = await listSubmissionCycles(midOctober)

      expect(cycles[0].cycle).toEqual(OCTOBER)
      expect(cycles[0].rosterCount).toBe(2)
      expect(cycles[0].submittedCount).toBe(1)
      expect(cycles[0].missingCount).toBe(1)

      expect(cycles.map((c) => c.cycle.dueMonth)).toEqual([10, 9])
      const september = cycles.find((c) => c.cycle.dueMonth === 9)
      expect(september?.submittedCount).toBe(0)
      expect(september?.missingCount).toBe(2)
    })

    it('is empty before the society has any records', async () => {
      expect(await listSubmissionCycles(midOctober)).toEqual([])
    })
  })
})
