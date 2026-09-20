import type { Metadata } from 'next'
import { Hind_Siliguri } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/components/ui/toast'
import { ThemeProvider } from '@/components/ui/theme-provider'
import { THEME_INIT_SCRIPT } from '@/lib/theme'

/**
 * Hind Siliguri carries both Bengali and Latin glyphs, so member names, amounts
 * and NHSS codes all render in one typeface rather than falling back mid-line.
 */
const bengali = Hind_Siliguri({
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
