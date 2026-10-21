import { withRoute } from '@/lib/api/handler'
import { validationFailed } from '@/lib/api/errors'
import { parseDueMonthKey } from '@/lib/due-cycle'
import { getSubmissionCycleReport } from '@/lib/queries/reports'
import {
  renderSubmissionWorkbook,
  submissionReportFileName,
} from '@/lib/reports/submission-sheet'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * The month-by-month submission report, as a downloadable .xlsx.
 *
 * `cycle` is the due-month key the rest of the domain already uses (`2026-10`),
 * which stands for the collection window 21 September → 20 October.
 */
export const GET = withRoute({ auth: 'admin' }, async ({ request }) => {
  const cycle = new URL(request.url).searchParams.get('cycle') ?? ''

  let dueMonth
  try {
    dueMonth = parseDueMonthKey(cycle)
  } catch {
    throw validationFailed({ cycle: 'expected YYYY-MM' })
  }

  const report = await getSubmissionCycleReport(dueMonth)
  const workbook = await renderSubmissionWorkbook(report)

  return new Response(new Uint8Array(workbook), {
    headers: {
      'content-type': XLSX_MIME,
      'content-disposition': `attachment; filename="${submissionReportFileName(report)}"`,
      // A money report must never be served from a cache.
      'cache-control': 'no-store',
    },
  })
})
