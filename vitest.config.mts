import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// `server-only` throws when imported outside a React Server Component bundle,
// so integration tests stub it out to exercise the service layer directly.
const SERVER_ONLY_STUB = resolve(import.meta.dirname, 'tests/helpers/server-only-stub.ts')

export default defineConfig({
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  test: {
    projects: [
      {
        resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
        test: {
          name: 'component',
          include: ['tests/component/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/helpers/setup-component.ts'],
        },
      },
      {
        resolve: {
          alias: { '@': resolve(import.meta.dirname, 'src'), 'server-only': SERVER_ONLY_STUB },
        },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // Integration tests share one Postgres database and truncate between
          // cases, so they must not run concurrently with each other.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
          setupFiles: ['tests/helpers/setup-integration.ts'],
        },
      },
    ],
  },
})
