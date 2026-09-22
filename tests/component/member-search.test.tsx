import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemberSearch } from '@/app/(site)/members/member-search'
import { routerMock } from '../helpers/router'

function setup(query = '') {
  const user = userEvent.setup()
  render(<MemberSearch query={query} />)
  return { user, box: screen.getByRole('searchbox') }
}

/** Longer than the 300ms debounce, for asserting that nothing happened. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 450))

describe('MemberSearch', () => {
  it('searches once the query is long enough', async () => {
    const { user, box } = setup()
    await user.type(box, 'riz')

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith('/members?q=riz', { scroll: false }),
    )
  })

  it('waits for a pause rather than searching per keystroke', async () => {
    const { user, box } = setup()
    await user.type(box, 'rizwan')
    await settle()

    // Six characters, one navigation: the debounce is what keeps a
    // search-as-you-type box from firing a request per letter.
    expect(routerMock.replace).toHaveBeenCalledTimes(1)
    expect(routerMock.replace).toHaveBeenCalledWith('/members?q=rizwan', { scroll: false })
  })

  it('ignores a single character and says why', async () => {
    const { user, box } = setup()
    await user.type(box, 'r')
    await settle()

    expect(routerMock.replace).not.toHaveBeenCalled()
    expect(screen.getByText('খুঁজতে অন্তত দুটি অক্ষর লিখুন')).toBeInTheDocument()
  })

  it('returns to the full list when the box is emptied', async () => {
    const { user, box } = setup('rizwan')
    await user.clear(box)

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith('/members', { scroll: false }),
    )
  })

  it('clears from the button too', async () => {
    const { user } = setup('rizwan')
    await user.click(screen.getByRole('button', { name: 'মুছুন' }))

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith('/members', { scroll: false }),
    )
  })

  it('does not navigate when the box already matches the page', async () => {
    setup('rizwan')
    await settle()

    // The render that answers a search must not trigger another one.
    expect(routerMock.replace).not.toHaveBeenCalled()
  })

  it('encodes a Bengali query', async () => {
    const { user, box } = setup()
    await user.type(box, '২৫০১১')

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith(
        `/members?q=${encodeURIComponent('২৫০১১')}`,
        { scroll: false },
      ),
    )
  })

  it('submits on Enter without waiting out the debounce', async () => {
    const { user, box } = setup()
    await user.type(box, 'saif{Enter}')

    expect(routerMock.replace).toHaveBeenCalledWith('/members?q=saif', { scroll: false })
  })
})
