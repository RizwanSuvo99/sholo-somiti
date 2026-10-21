import { describe, expect, it } from 'vitest'
import {
  SUBMISSION_SHEET_COLUMNS,
  buildSubmissionSheet,
  submissionReportFileName,
  submissionRowCells,
} from '@/lib/reports/submission-sheet'
import type { SubmissionCycleReport, SubmissionReportRow } from '@/lib/queries/reports'

const OCTOBER = { dueYear: 2026, dueMonth: 10 }

const paid: SubmissionReportRow = {
  memberCode: 'NHSS-25011',
  name: 'মোঃ রিজওয়ান উদ্দিন',
  fatherName: 'পিতার নাম',
  mobile: '01700000000',
  email: 'a@b.test',
  submitted: true,
  dueMonth: OCTOBER,
  sendingDate: { y: 2026, m: 10, d: 12 },
  // 19:00 UTC is already the next calendar day in Dhaka (+6).
  submittedAt: new Date('2026-10-12T19:00:00.000Z'),
  reviewedAt: new Date('2026-10-13T04:00:00.000Z'),
  status: 'APPROVED',
  amountPaisa: 700_000,
  paymentMedium: 'MOBILE_BANKING',
  bankOrProvider: 'BKASH',
  senderNumber: '01800000000',
  transactionRef: 'TXN12345',
  screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/proof.jpg',
  rejectionReason: null,
}

const missing: SubmissionReportRow = {
  memberCode: 'NHSS-25024',
  name: 'আরমান হোসেন ভূঁইয়া',
  fatherName: null,
  mobile: null,
  email: null,
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
}

const report = (rows: SubmissionReportRow[]): SubmissionCycleReport => ({
  cycle: OCTOBER,
  startCivil: { y: 2026, m: 9, d: 21 },
  endCivil: { y: 2026, m: 10, d: 20 },
  rows,
  submittedCount: rows.filter((r) => r.submitted).length,
  missingCount: rows.filter((r) => !r.submitted).length,
})

/** Column index by header, so the assertions survive a reordering. */
const at = (cells: unknown[], header: string) =>
  cells[SUBMISSION_SHEET_COLUMNS.findIndex((c) => c.header === header)]

describe('submission report sheet', () => {
  it('opens with one bold header per column', () => {
    const [header] = buildSubmissionSheet(report([paid]))

    expect(header).toHaveLength(SUBMISSION_SHEET_COLUMNS.length)
    expect(header.every((cell) => cell && 'fontWeight' in cell && cell.fontWeight === 'bold')).toBe(
      true,
    )
    expect(header[0]).toEqual({ value: 'সদস্য আইডি', fontWeight: 'bold' })
  })

  it('writes money as a number in taka, not a formatted string', () => {
    const amount = at(submissionRowCells(paid), 'টাকার পরিমাণ')

    // ৳7,000 — summable in Excel, which a '৳ ৭,০০০' string would not be.
    expect(amount).toEqual({ type: Number, value: 7000, format: '#,##0.00' })
  })

  it('makes the screenshot clickable through a HYPERLINK formula', () => {
    const cell = at(submissionRowCells(paid), 'প্রমাণের ছবি')

    expect(cell).toEqual({
      type: 'Formula',
      value: '=HYPERLINK("https://res.cloudinary.com/demo/image/upload/proof.jpg","ছবি দেখুন")',
    })
  })

  it('escapes a quote in the screenshot URL instead of breaking the formula', () => {
    const cell = at(
      submissionRowCells({
        ...paid,
        screenshotUrl: 'https://res.cloudinary.com/demo/a"b.jpg',
      }),
      'প্রমাণের ছবি',
    ) as { value: string }

    expect(cell.value).toBe('=HYPERLINK("https://res.cloudinary.com/demo/a""b.jpg","ছবি দেখুন")')
  })

  it('will not make a link out of a proof stored somewhere other than the upload host', () => {
    // The URL reaches the database from the client, so a crafted submission
    // could name any host. Shown, but never clickable.
    for (const url of ['https://attacker.test/a.jpg', 'file://a-server/share/a.jpg']) {
      const cell = at(submissionRowCells({ ...paid, screenshotUrl: url }), 'প্রমাণের ছবি')
      expect(cell).toEqual({ type: String, value: url })
    }
  })

  it('dates the sending day as the Dhaka calendar day, whatever the server timezone', () => {
    const cell = at(submissionRowCells(paid), 'টাকা পাঠানোর তারিখ') as { value: Date }

    // Asserted as an absolute instant: the same under TZ=UTC and TZ=Kiritimati,
    // which is what `pnpm test:tz` checks.
    expect(cell.value.getTime()).toBe(Date.UTC(2026, 9, 12))
  })

  it('reads a timestamp in Dhaka, so an evening submission is not dated a day early', () => {
    const cells = submissionRowCells(paid)

    // 12 Oct 19:00 UTC = 13 Oct 01:00 in Dhaka.
    expect((at(cells, 'ফর্ম জমার তারিখ') as { value: Date }).value.getTime()).toBe(
      Date.UTC(2026, 9, 13),
    )
    expect((at(cells, 'অনুমোদনের তারিখ') as { value: Date }).value.getTime()).toBe(
      Date.UTC(2026, 9, 13),
    )
  })

  it('translates status, medium and provider into Bengali', () => {
    const cells = submissionRowCells(paid)

    expect(at(cells, 'অবস্থা')).toEqual({ type: String, value: 'অনুমোদিত' })
    expect(at(cells, 'মাধ্যম')).toEqual({ type: String, value: 'মোবাইল ব্যাংকিং' })
    expect(at(cells, 'ব্যাংক / প্রদানকারী')).toEqual({ type: String, value: 'বিকাশ' })
    expect(at(cells, 'কোন মাসের চাঁদা')).toEqual({ type: String, value: 'অক্টোবর ২০২৬' })
  })

  it('keeps a bank name as written rather than forcing it through the provider map', () => {
    const cells = submissionRowCells({
      ...paid,
      paymentMedium: 'NPSB',
      bankOrProvider: 'ইসলামী ব্যাংক',
    })

    expect(at(cells, 'ব্যাংক / প্রদানকারী')).toEqual({ type: String, value: 'ইসলামী ব্যাংক' })
    expect(at(cells, 'মাধ্যম')).toEqual({ type: String, value: 'এনপিএসবি' })
  })

  it('spells out a member who sent nothing and leaves their payment columns empty', () => {
    const cells = submissionRowCells(missing)

    expect(at(cells, 'জমা দিয়েছেন?')).toEqual({ type: String, value: 'না' })
    expect(at(cells, 'অবস্থা')).toEqual({ type: String, value: 'জমা দেননি' })
    expect(at(cells, 'টাকা পাঠানোর তারিখ')).toBeNull()
    expect(at(cells, 'টাকার পরিমাণ')).toBeNull()
    expect(at(cells, 'প্রমাণের ছবি')).toBeNull()
    // Identity still present, which is the whole point of the row.
    expect(at(cells, 'সদস্য আইডি')).toEqual({ type: String, value: 'NHSS-25024' })
  })

  it('names the file after the cycle', () => {
    expect(submissionReportFileName(report([]))).toBe('somiti-submissions-2026-10.xlsx')
    expect(
      submissionReportFileName({ ...report([]), cycle: { dueYear: 2027, dueMonth: 3 } }),
    ).toBe('somiti-submissions-2027-03.xlsx')
  })

  it('emits one row per member plus the header', () => {
    expect(buildSubmissionSheet(report([paid, missing]))).toHaveLength(3)
  })
})
