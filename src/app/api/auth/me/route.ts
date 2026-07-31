import { ok, withRoute } from '@/lib/api/handler'

export const GET = withRoute({ auth: 'admin' }, async ({ admin }) => ok(admin))
