import { describe, expect, it } from 'vitest'
import {
  MEMBER_CODE_PREFIX,
  formatMemberCode,
  isValidMemberCode,
  normalizeMemberCode,
  parseMemberCode,
} from '@/lib/member-code'

describe('formatMemberCode', () => {
  it('matches the format in the specification', () => {
    expect(formatMemberCode(2025, 1)).toBe('NHSS-25001')
    expect(formatMemberCode(2025, 28)).toBe('NHSS-25028')
  })

  it('uses the joining year, while the sequence runs continuously', () => {
    // The 29th member ever, added in 2026 — not NHSS-26001.
    expect(formatMemberCode(2026, 29)).toBe('NHSS-26029')
  })

  it('grows past the zero-padded width rather than truncating', () => {
    expect(formatMemberCode(2025, 1000)).toBe('NHSS-251000')
  })
})

describe('parseMemberCode', () => {
  it('extracts the year code and sequence', () => {
    expect(parseMemberCode('NHSS-25001')).toEqual({
      prefix: MEMBER_CODE_PREFIX,
      yearCode: 25,
      sequence: 1,
    })
  })

  it('round-trips with formatMemberCode', () => {
    const parsed = parseMemberCode(formatMemberCode(2026, 29))
    expect(parsed?.yearCode).toBe(26)
    expect(parsed?.sequence).toBe(29)
  })

  it.each(['', 'NHSS-', 'ABCD-25001', 'NHSS-2500'])('rejects %s', (code) => {
    expect(parseMemberCode(code)).toBeNull()
    expect(isValidMemberCode(code)).toBe(false)
  })
})

describe('normalizeMemberCode — forgiving what members actually type', () => {
  it.each([
    ['nhss-25001', 'NHSS-25001'],
    ['NHSS25001', 'NHSS-25001'],
    ['nhss 25001', 'NHSS-25001'],
    ['  NHSS-25001  ', 'NHSS-25001'],
    ['25001', 'NHSS-25001'],
    ['NHSS-২৫০০১', 'NHSS-25001'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeMemberCode(input)).toBe(expected)
  })

  it('leaves an already-canonical code untouched', () => {
    expect(normalizeMemberCode('NHSS-25001')).toBe('NHSS-25001')
  })

  it('accepts a bare sequence, since parsing normalises first', () => {
    // Members routinely type just the digits off their card.
    expect(parseMemberCode('25001')?.sequence).toBe(1)
  })
})
