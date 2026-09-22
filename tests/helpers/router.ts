import { vi } from 'vitest'

/**
 * One shared router stub, so a test can assert on the navigation a component
 * performed. The setup file mocks `next/navigation` to hand this back from
 * `useRouter`, and clears it between tests.
 */
export const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}
