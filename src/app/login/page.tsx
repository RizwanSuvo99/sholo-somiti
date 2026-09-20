import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/auth/require-admin'
import { LoginForm } from './login-form'
import { ThemeToggle } from '@/components/ui/theme-toggle'

export const metadata = { title: 'প্রবেশ — ষোলো সমবায় সমিতি' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  if (await getAdmin()) redirect('/admin')

  const { next } = await searchParams
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      {/* The login page sits outside both shells, so it carries its own. */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand">ষোলো সমবায় সমিতি</h1>
          <p className="mt-1 text-sm text-muted">প্রশাসক প্রবেশ</p>
        </div>
        <LoginForm nextPath={next} />
      </div>
    </main>
  )
}
