import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { routerMock } from './router'

// jsdom has no Next router; components navigate through this stub instead.
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/pay/submit',
}))

afterEach(() => {
  cleanup()
  for (const fn of Object.values(routerMock)) fn.mockClear()
})
