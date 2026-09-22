import { describe, expect, it } from 'vitest'
import { matchesSearch, normalizeSearch } from '@/lib/search'

const MEMBER = ['Md Rizwan Uddin', 'NHSS-25011'] as const

describe('normalizeSearch', () => {
  it('folds Bengali numerals to Latin', () => {
    // The site prints every figure in Bengali, so this is what a member copies.
    expect(normalizeSearch('২৫০১১')).toBe('25011')
  })

  it('drops spaces and hyphens', () => {
    expect(normalizeSearch(' NHSS-250 11 ')).toBe('nhss25011')
  })
})

describe('matchesSearch', () => {
  it.each([
    'NHSS-25011',
    'nhss-25011',
    'nhss 25011',
    '25011',
    '২৫০১১',
    '011',
    'rizwan',
    'RIZWAN UDDIN',
    'md rizwan',
  ])('finds the member by %s', (query) => {
    expect(matchesSearch(MEMBER, query)).toBe(true)
  })

  it.each(['25012', 'saifur', 'NHSS-26011'])('does not match %s', (query) => {
    expect(matchesSearch(MEMBER, query)).toBe(false)
  })

  it('treats a blank query as no filter', () => {
    expect(matchesSearch(MEMBER, '')).toBe(true)
    expect(matchesSearch(MEMBER, '   ')).toBe(true)
  })

  it('ignores null and undefined fields', () => {
    expect(matchesSearch([null, undefined, 'কামরুল'], 'কামরুল')).toBe(true)
    expect(matchesSearch([null, undefined], 'কামরুল')).toBe(false)
  })
})
