import type { Metadata } from 'next'
import { Hind_Siliguri } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/components/ui/toast'

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
    <html lang="bn" className={`${bengali.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-surface text-ink">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
