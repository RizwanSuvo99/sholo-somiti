import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, pageCountOf, pageWindow, paginate, parsePage } from '@/lib/paginate'

describe('parsePage', () => {
  it.each([
    [undefined, 1],
    ['', 1],
    ['0', 1],
    ['-4', 1],
    ['abc', 1],
    ['2', 2],
    ['3.7', 3],
  ])('turns %s into page %i', (input, expected) => {
    expect(parsePage(input, 10)).toBe(expected)
  })

  it('clamps past the last page rather than erroring', () => {
    expect(parsePage('99', 4)).toBe(4)
  })

  it('takes the first value when a param is repeated', () => {
    expect(parsePage(['2', '5'], 10)).toBe(2)
  })
})

describe('pageCountOf', () => {
  it('shows fifteen rows to a page', () => {
    expect(PAGE_SIZE).toBe(15)
  })

  it('is at least one page even with no rows', () => {
    expect(pageCountOf(0)).toBe(1)
  })

  it.each([
    [1, 1],
    [PAGE_SIZE, 1],
    [PAGE_SIZE + 1, 2],
    [PAGE_SIZE * 2, 2],
    [PAGE_SIZE * 2 + 1, 3],
  ])('%i rows fills %i pages', (total, expected) => {
    expect(pageCountOf(total)).toBe(expected)
  })
})

describe('paginate', () => {
  it('describes the first page of a full listing', () => {
    expect(paginate(PAGE_SIZE * 2 + 3, undefined)).toMatchObject({
      page: 1,
      pageCount: 3,
      skip: 0,
      take: PAGE_SIZE,
      from: 1,
      to: PAGE_SIZE,
    })
  })

  it('describes a partial last page', () => {
    const total = PAGE_SIZE * 2 + 3
    expect(paginate(total, '3')).toMatchObject({
      page: 3,
      skip: PAGE_SIZE * 2,
      from: PAGE_SIZE * 2 + 1,
      to: total,
    })
  })

  it('fits the society on a single page', () => {
    // 29 members: one page rather than the three that ten-a-page gave.
    expect(paginate(29, undefined)).toMatchObject({ pageCount: 2, to: PAGE_SIZE })
  })

  it('reports an empty range with no rows', () => {
    expect(paginate(0, '1')).toMatchObject({ page: 1, pageCount: 1, from: 0, to: 0 })
  })
})

describe('pageWindow', () => {
  it('lists every page when there are few', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps the first and last page with a gap in between', () => {
    expect(pageWindow(6, 12)).toEqual([1, null, 5, 6, 7, null, 12])
  })

  it('does not open a gap of a single page', () => {
    expect(pageWindow(2, 8)).toEqual([1, 2, 3, null, 8])
  })
})
