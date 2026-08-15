import { ok, withRoute } from '@/lib/api/handler'
import { getDashboard } from '@/lib/queries/dashboard'

export const dynamic = 'force-dynamic'

export const GET = withRoute({ auth: 'admin' }, async () => ok(await getDashboard()))
