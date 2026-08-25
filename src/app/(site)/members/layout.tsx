import type { Metadata } from 'next'

/**
 * Member pages stay reachable by link but out of search results — see
 * src/app/robots.ts for the reasoning.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function MembersLayout({ children }: LayoutProps<'/members'>) {
  return children
}
