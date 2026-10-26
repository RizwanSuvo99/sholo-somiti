import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '@/app/login/login-form'
import { routerMock } from '../helpers/router'

/**
 * Logging in crosses an auth boundary, so it ends in a full document load.
 *
 * The previous version called `router.replace(next)` and `router.refresh()` back
 * to back. `refresh()` re-renders the *current* route and discarded the in-flight
 * replace, so the admin landed back on /login?next=/admin — visible in the
 * production access log as a successful POST followed only by an RSC refetch of
 * /login, with no request for /admin at all. On localhost the replace won the
 * race, which is why it only ever showed up in production.
 *
 * A real navigation removes the ordering question entirely: one fresh request
 * carrying the new cookie, honoured by middleware and every server component,
 * with no client router cache in the way.
 */

let assigned: string[]

beforeEach(() => {
  vi.restoreAllMocks()
  assigned = []
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign: (url: string) => assigned.push(url) },
  })
})

function okLogin() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function submit(nextPath?: string) {
  const user = userEvent.setup()
  render(<LoginForm nextPath={nextPath} />)
  await user.type(screen.getByLabelText(/ইমেইল/), 'admin@test.local')
  await user.type(screen.getByLabelText(/পাসওয়ার্ড/), 'correct-horse-battery')
  await user.click(screen.getByRole('button', { name: 'প্রবেশ করুন' }))
}

describe('logging in', () => {
  it('lands on the requested page with a full load', async () => {
    okLogin()
    await submit('/admin')

    expect(assigned).toEqual(['/admin'])
  })

  it('defaults to the dashboard when no page was requested', async () => {
    okLogin()
    await submit(undefined)

    expect(assigned).toEqual(['/admin'])
  })

  it('does not call router.refresh, which is what used to swallow the navigation', async () => {
    okLogin()
    await submit('/admin')

    expect(routerMock.refresh).not.toHaveBeenCalled()
    expect(routerMock.replace).not.toHaveBeenCalled()
  })

  it('shows the server’s message and stays put when the password is wrong', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { messageBn: 'ইমেইল বা পাসওয়ার্ড ভুল' } }),
      } as Response),
    )
    await submit('/admin')

    expect(await screen.findByText('ইমেইল বা পাসওয়ার্ড ভুল')).toBeInTheDocument()
    expect(assigned).toEqual([])
  })

  /**
   * `next` comes from the query string, so it is attacker-controlled. A real
   * navigation makes that dangerous in a way `router.replace` was not: the old
   * `startsWith('/')` check accepts `//evil.test`, which a browser reads as a
   * protocol-relative URL and follows off-site. Anyone could have mailed the
   * admin a login link that bounced them to a copy of this panel.
   */
  describe('refuses to be redirected off-site', () => {
    const hostile = [
      ['protocol-relative', '//evil.test/panel'],
      ['protocol-relative with backslashes', '/\\evil.test'],
      ['absolute http', 'http://evil.test'],
      ['absolute https', 'https://evil.test'],
      ['scheme-ish', 'javascript:alert(1)'],
      ['no leading slash', 'evil.test'],
      ['backslash path', '\\evil.test'],
    ] as const

    for (const [name, value] of hostile) {
      it(`ignores a ${name} next value`, async () => {
        okLogin()
        await submit(value)

        expect(assigned).toEqual(['/admin'])
      })
    }

    it('still allows an ordinary in-app path', async () => {
      okLogin()
      await submit('/admin/personal-dues')

      expect(assigned).toEqual(['/admin/personal-dues'])
    })
  })
})
