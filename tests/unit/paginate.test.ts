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
  it('is at least one page even with no rows', () => {
    expect(pageCountOf(0)).toBe(1)
  })

  it.each([
    [1, 1],
    [10, 1],
    [11, 2],
    [28, 3],
  ])('%i rows fills %i pages', (total, expected) => {
    expect(pageCountOf(total)).toBe(expected)
  })
})

describe('paginate', () => {
  it('describes the first page of 28 rows', () => {
    expect(paginate(28, undefined)).toMatchObject({
      page: 1,
      pageCount: 3,
      skip: 0,
      take: PAGE_SIZE,
      from: 1,
      to: 10,
    })
  })

  it('describes a partial last page', () => {
    expect(paginate(28, '3')).toMatchObject({ page: 3, skip: 20, from: 21, to: 28 })
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
