import { describe, expect, it } from 'vitest'
import {
  CURRENCY_GAP,
  formatBDT,
  fromPaisa,
  sumPaisa,
  toBnDigits,
  toEnDigits,
  toPaisa,
} from '@/lib/money'

describe('digit conversion', () => {
  it('renders Latin digits as Bengali', () => {
    expect(toBnDigits(2026)).toBe('২০২৬')
    expect(toBnDigits('1,234.50')).toBe('১,২৩৪.৫০')
  })

  it('renders Bengali digits back as Latin', () => {
    expect(toEnDigits('২০২৬')).toBe('2026')
  })

  it('round-trips', () => {
    expect(toEnDigits(toBnDigits('9876543210'))).toBe('9876543210')
  })
})

describe('toPaisa', () => {
  it('converts whole taka', () => {
    expect(toPaisa('200')).toBe(20_000)
    expect(toPaisa(200)).toBe(20_000)
  })

  it('converts fractional taka without float drift', () => {
    expect(toPaisa('0.1')).toBe(10)
    expect(toPaisa('1234.56')).toBe(123_456)
    expect(toPaisa('0.07')).toBe(7)
  })

  it('accepts what people actually type', () => {
    expect(toPaisa('৳ 2,000')).toBe(200_000)
    expect(toPaisa('  1,500  ')).toBe(150_000)
    expect(toPaisa('২০০')).toBe(20_000)
  })

  it('rounds to the nearest paisa exactly once', () => {
    expect(toPaisa('10.005')).toBe(1_001)
  })

  it.each(['', 'abc', '12.34.56', '৳'])('rejects %s', (input) => {
    expect(() => toPaisa(input)).toThrow(RangeError)
  })

  it('rejects non-finite numbers', () => {
    expect(() => toPaisa(Number.NaN)).toThrow(RangeError)
    expect(() => toPaisa(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

describe('formatBDT', () => {
  it('separates the symbol from the amount', () => {
    // Without this the headstrokes of ৳ and ১ join and the digit reads as part
    // of the symbol.
    expect(formatBDT(10_000)).toBe(`৳${CURRENCY_GAP}১০০`)
    expect(CURRENCY_GAP).toBe('\u202F')
  })

  it('keeps the symbol and amount on one line', () => {
    // A narrow NO-BREAK space, so an amount never wraps after the ৳.
    expect(formatBDT(10_000)).not.toContain(' ')
  })

  it('formats whole taka in Bengali digits by default', () => {
    expect(formatBDT(20_000)).toBe('৳ ২০০')
  })

  it('groups South Asian style — last three, then pairs', () => {
    expect(formatBDT(12_345_67_00, { bnDigits: false })).toBe('৳ 12,34,567')
  })

  it('shows paisa only when there are any', () => {
    expect(formatBDT(20_050, { bnDigits: false })).toBe('৳ 200.50')
    expect(formatBDT(20_000, { bnDigits: false })).toBe('৳ 200')
  })

  it('can be forced to two decimal places', () => {
    expect(formatBDT(20_000, { bnDigits: false, decimals: true })).toBe('৳ 200.00')
  })

  it('can omit the symbol', () => {
    expect(formatBDT(20_000, { bnDigits: false, symbol: false })).toBe('200')
  })

  it('formats zero and negatives', () => {
    expect(formatBDT(0, { bnDigits: false })).toBe('৳ 0')
    expect(formatBDT(-20_000, { bnDigits: false })).toBe('-৳ 200')
  })
})

describe('fromPaisa / sumPaisa', () => {
  it('converts back to taka', () => {
    expect(fromPaisa(20_000)).toBe(200)
  })

  it('sums exactly where floats would drift', () => {
    // 0.1 + 0.2 !== 0.3 in taka; in paisa it is just 10 + 20 === 30.
    expect(sumPaisa([10, 20])).toBe(30)
    expect(sumPaisa([])).toBe(0)
  })
})
