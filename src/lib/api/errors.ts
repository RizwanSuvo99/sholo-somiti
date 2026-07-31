/**
 * Application errors, and the mapping from database-level violations to them.
 *
 * Every message carries a Bengali string, because these surface directly in the
 * member-facing form.
 */

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'DUPLICATE_SUBMISSION'
  | 'SUBMISSION_ALREADY_REVIEWED'
  | 'ALREADY_PAID'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL'

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly messageBn: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const unauthorized = () =>
  new AppError('UNAUTHORIZED', 401, 'Authentication required', 'প্রবেশ করুন')

export const forbidden = () =>
  new AppError('FORBIDDEN', 403, 'Not permitted', 'এই কাজের অনুমতি নেই')

export const notFound = (what = 'Resource', whatBn = 'তথ্য') =>
  new AppError('NOT_FOUND', 404, `${what} not found`, `${whatBn} পাওয়া যায়নি`)

export const conflict = (
  code: ErrorCode,
  message: string,
  messageBn: string,
  details?: unknown,
) => new AppError(code, 409, message, messageBn, details)

export const rateLimited = () =>
  new AppError(
    'RATE_LIMITED',
    429,
    'Too many requests',
    'অনেক বেশি অনুরোধ — কিছুক্ষণ পর আবার চেষ্টা করুন',
  )

export const validationFailed = (details?: unknown) =>
  new AppError(
    'VALIDATION_FAILED',
    422,
    'Validation failed',
    'দেওয়া তথ্যে ভুল আছে',
    details,
  )

export const duplicateSubmission = () =>
  conflict(
    'DUPLICATE_SUBMISSION',
    'An active submission already exists for this member and month',
    'এই মাসের জন্য আপনার একটি আবেদন ইতিমধ্যে জমা আছে',
  )

/** The raw name of the partial unique index enforcing one submission per month. */
export const ACTIVE_SUBMISSION_INDEX = 'payment_submissions_active_member_month_key'

/**
 * Is this error the one-submission-per-month index firing?
 *
 * Because that index is created in raw SQL rather than declared in the schema,
 * Prisma reports it with `meta.target` set to the *index name string* instead of
 * the usual array of field names. Both shapes are checked, plus the underlying
 * Postgres code, so the rule degrades to a clean 409 rather than a 500 whichever
 * layer reports it.
 */
export function isActiveSubmissionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const candidate = error as {
    code?: string
    meta?: { target?: unknown; constraint?: unknown }
  }

  if (candidate.code !== 'P2002' && candidate.code !== '23505') return false

  const target = candidate.meta?.target ?? candidate.meta?.constraint
  const asText = Array.isArray(target) ? target.join(',') : String(target ?? '')
  return asText.includes(ACTIVE_SUBMISSION_INDEX)
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: string }).code
  return code === 'P2002' || code === '23505'
}
