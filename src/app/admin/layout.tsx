import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/auth/require-admin'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/admin/sidebar'
import { LogoutButton } from '@/components/admin/logout-button'

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  // Middleware already redirected unauthenticated visitors, but it only checks a
  // cookie signature. This is the check that actually consults the database.
  const admin = await getAdmin()
  if (!admin) redirect('/login')

  const pendingCount = await prisma.paymentSubmission.count({ where: { status: 'PENDING' } })

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line/80 bg-panel/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-lg shadow-emerald-600/25">
              ষো
            </span>
            <div>
              <p className="font-bold text-ink">ষোলো সমবায় সমিতি</p>
              <p className="text-xs text-muted">{admin.name} · প্রশাসক</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row">
        <aside className="md:w-52 md:shrink-0">
          <Sidebar pendingCount={pendingCount} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
