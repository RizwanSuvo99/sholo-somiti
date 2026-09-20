import Link from 'next/link'
import { SiteHeader } from '@/components/public/site-header'

/**
 * The public side of the site: anyone may read these pages without logging in.
 * Nothing rendered under this layout may include member contact details or
 * payment reference numbers — see src/lib/queries/public.ts.
 */
export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />
      <div className="flex-1">{children}</div>

      <footer className="border-t border-line bg-panel">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted">
          <span>ষোলো সমবায় সমিতি — সদস্যদের জন্য উন্মুক্ত হিসাব</span>
          {/* Points at the panel rather than the login form: a signed-in admin
              lands there directly, and anyone else is sent to log in and
              returned here afterwards. Avoids reading the session cookie in
              this layout, which would make every public page render per
              request. */}
          <Link href="/admin" className="underline">
            প্রশাসক প্যানেল
          </Link>
        </div>
      </footer>
    </div>
  )
}
