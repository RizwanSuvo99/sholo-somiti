import {
  PAYMENT_MEDIUM_BN,
  PROVIDER_BN,
  SUBMISSION_STATUS_BN,
  dueMonthLabel,
} from '@/lib/bn'
import { civilToDbDate, instantToDhakaCivil, type CivilDate } from '@/lib/due-cycle'
import { fromPaisa } from '@/lib/money'
import type { SubmissionCycleReport, SubmissionReportRow } from '@/lib/queries/reports'

/**
 * A cell in the shape `write-excel-file` expects. Declared here rather than
 * imported so the sheet can be built and asserted without the writer.
 */
export type SheetCell =
  | null
  | { value: string; fontWeight?: 'bold'; backgroundColor?: string; align?: 'center' }
  | { type: typeof String; value: string }
  | { type: typeof Number; value: number; format?: string }
  | { type: typeof Date; value: Date; format?: string }
  | { type: 'Formula'; value: string }

export type SheetColumn = { width: number }

const DATE_FORMAT = 'dd/mm/yyyy'
const MONEY_FORMAT = '#,##0.00'

export const SUBMISSION_SHEET_COLUMNS: { header: string; width: number }[] = [
  { header: 'সদস্য আইডি', width: 13 },
  { header: 'নাম', width: 26 },
  { header: 'পিতার নাম', width: 24 },
  { header: 'মোবাইল', width: 14 },
  { header: 'ইমেইল', width: 26 },
  { header: 'জমা দিয়েছেন?', width: 13 },
  { header: 'কোন মাসের চাঁদা', width: 16 },
  { header: 'টাকা পাঠানোর তারিখ', width: 18 },
  { header: 'ফর্ম জমার তারিখ', width: 16 },
  { header: 'অনুমোদনের তারিখ', width: 17 },
  { header: 'অবস্থা', width: 14 },
  { header: 'টাকার পরিমাণ', width: 14 },
  { header: 'মাধ্যম', width: 16 },
  { header: 'ব্যাংক / প্রদানকারী', width: 18 },
  { header: 'প্রেরকের নম্বর', width: 15 },
  { header: 'লেনদেন আইডি', width: 20 },
  { header: 'প্রমাণের ছবি', width: 14 },
  { header: 'বাতিলের কারণ', width: 24 },
]

/** Excel takes the label from a HYPERLINK formula; a bare URL is not clickable. */
function linkCell(url: string, label: string): SheetCell {
  const quoted = (value: string) => `"${value.replace(/"/g, '""')}"`
  return { type: 'Formula', value: `=HYPERLINK(${quoted(url)},${quoted(label)})` }
}

/**
 * Dates go in as `Date.UTC(...)` of the Dhaka calendar day.
 *
 * The writer converts a Date to an Excel serial by pure UTC arithmetic, with no
 * timezone adjustment, so a UTC-midnight value lands on the intended day
 * wherever the server runs. Passing a raw instant instead would shift the day
 * by one for anyone west of Dhaka.
 */
function dateCell(civil: CivilDate | null): SheetCell {
  if (!civil) return null
  return { type: Date, value: civilToDbDate(civil), format: DATE_FORMAT }
}

function instantCell(instant: Date | null): SheetCell {
  return instant ? dateCell(instantToDhakaCivil(instant)) : null
}

function text(value: string | null): SheetCell {
  return value ? { type: String, value } : null
}

function bankLabel(row: SubmissionReportRow): string | null {
  if (!row.bankOrProvider) return null
  return PROVIDER_BN[row.bankOrProvider] ?? row.bankOrProvider
}

export function submissionRowCells(row: SubmissionReportRow): SheetCell[] {
  return [
    { type: String, value: row.memberCode },
    { type: String, value: row.name },
    text(row.fatherName),
    text(row.mobile),
    text(row.email),
    { type: String, value: row.submitted ? 'হ্যাঁ' : 'না' },
    row.dueMonth ? { type: String, value: dueMonthLabel(row.dueMonth) } : null,
    dateCell(row.sendingDate),
    instantCell(row.submittedAt),
    instantCell(row.reviewedAt),
    {
      type: String,
      value: row.status ? (SUBMISSION_STATUS_BN[row.status] ?? row.status) : 'জমা দেননি',
    },
    row.amountPaisa === null
      ? null
      : { type: Number, value: fromPaisa(row.amountPaisa), format: MONEY_FORMAT },
    row.paymentMedium
      ? { type: String, value: PAYMENT_MEDIUM_BN[row.paymentMedium] ?? row.paymentMedium }
      : null,
    text(bankLabel(row)),
    text(row.senderNumber),
    text(row.transactionRef),
    row.screenshotUrl ? linkCell(row.screenshotUrl, 'ছবি দেখুন') : null,
    text(row.rejectionReason),
  ]
}

export function buildSubmissionSheet(report: SubmissionCycleReport): SheetCell[][] {
  return [
    SUBMISSION_SHEET_COLUMNS.map((column) => ({ value: column.header, fontWeight: 'bold' as const })),
    ...report.rows.map(submissionRowCells),
  ]
}

export function submissionSheetColumns(): SheetColumn[] {
  return SUBMISSION_SHEET_COLUMNS.map((column) => ({ width: column.width }))
}

/** `somiti-submissions-2026-10.xlsx` — ASCII, so it survives every mail client. */
export function submissionReportFileName(report: SubmissionCycleReport): string {
  const month = String(report.cycle.dueMonth).padStart(2, '0')
  return `somiti-submissions-${report.cycle.dueYear}-${month}.xlsx`
}

export async function renderSubmissionWorkbook(report: SubmissionCycleReport): Promise<Buffer> {
  const { default: writeXlsxFile } = await import('write-excel-file/node')

  return writeXlsxFile(buildSubmissionSheet(report), {
    sheet: dueMonthLabel(report.cycle),
    columns: submissionSheetColumns(),
    stickyRowsCount: 1,
  }).toBuffer()
}
