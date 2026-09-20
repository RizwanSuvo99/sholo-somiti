import type { Metadata } from 'next'
import { Noto_Sans_Bengali } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/components/ui/toast'
import { ThemeProvider } from '@/components/ui/theme-provider'
import { THEME_INIT_SCRIPT } from '@/lib/theme'

/**
 * Noto Sans Bengali, chosen for complete and consistent coverage of the Bengali
 * block — digits included.
 *
 * The previous face rendered ১ from a fallback at different metrics, so amounts
 * like ৳১,২৭,০০০ appeared to be missing their first digit. Noto is maintained
 * specifically to avoid gaps like that, which matters here because every figure
 * on the site is written in Bengali numerals.
 */
const bengali = Noto_Sans_Bengali({
  variable: '--font-bengali',
  subsets: ['bengali', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ষোলো সমবায় সমিতি',
  description: 'ষোলো সমবায় সমিতির সদস্য, চাঁদা ও হিসাব ব্যবস্থাপনা',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // The inline script sets data-theme before React runs, so the server markup
    // and the hydrated markup disagree on that attribute by design.
    <html lang="bn" className={`${bengali.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-surface text-ink">
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
