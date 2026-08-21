import { ok, withRoute } from '@/lib/api/handler'
import { runMonthRollover } from '@/lib/services/rollover'

/**
 * Called from the system crontab just after each deadline:
 *
 *   TZ=Asia/Dhaka
 *   5 0 21 * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     http://127.0.0.1:3002/api/cron/month-rollover
 *
 * A logged-in admin may also trigger it from the dashboard; both paths run the
 * identical code, and running it twice is a no-op.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const handler = withRoute({ auth: 'cron' }, async () => ok(await runMonthRollover()))

export const POST = handler
export const GET = handler
