import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  addMonths,
  civilToDbDate,
  currentDueMonth,
  daysInMonth,
  dbDateToCivil,
  deadlineInstant,
  dueMonthForCivilDate,
  dueMonthForInstant,
  dueMonthKey,
  dueMonthsBetween,
  dueWindow,
  formatCivilDate,
  instantToDhakaCivil,
  isBeforeWindow,
  isWithinWindow,
  parseCivilDate,
  parseDueMonthKey,
  type CivilDate,
  type DueMonth,
} from '@/lib/due-cycle'

const due = (dueYear: number, dueMonth: number): DueMonth => ({ dueYear, dueMonth })

describe('parseCivilDate', () => {
  it('parses a valid date without timezone interference', () => {
    expect(parseCivilDate('2026-04-20')).toEqual({ y: 2026, m: 4, d: 20 })
  })

  it('accepts a real leap day', () => {
    expect(parseCivilDate('2028-02-29')).toEqual({ y: 2028, m: 2, d: 29 })
  })

  it.each([
    ['2027-02-29', 'non-leap 29 February'],
    ['2026-13-01', 'month 13'],
    ['2026-00-10', 'month 0'],
    ['2026-04-31', '31 April'],
    ['2026-4-1', 'unpadded'],
    ['20260401', 'no separators'],
    ['not a date', 'nonsense'],
    ['', 'empty'],
  ])('rejects %s (%s)', (input) => {
    expect(() => parseCivilDate(input)).toThrow(RangeError)
  })

  it('round-trips through formatCivilDate', () => {
    expect(formatCivilDate(parseCivilDate('2026-12-21'))).toBe('2026-12-21')
  })
})

describe('daysInMonth', () => {
  it('handles leap years', () => {
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2027, 2)).toBe(28)
    expect(daysInMonth(2000, 2)).toBe(29) // divisible by 400
    expect(daysInMonth(1900, 2)).toBe(28) // divisible by 100, not 400
  })
})

describe('addMonths', () => {
  it('rolls December into January of the next year', () => {
    expect(addMonths(due(2026, 12), 1)).toEqual(due(2027, 1))
  })

  it('rolls January back into December of the previous year', () => {
    expect(addMonths(due(2026, 1), -1)).toEqual(due(2025, 12))
  })

  it('spans multiple years in both directions', () => {
    expect(addMonths(due(2026, 4), 25)).toEqual(due(2028, 5))
    expect(addMonths(due(2026, 4), -25)).toEqual(due(2024, 3))
  })
})

describe('dueMonthForCivilDate — the 21st→20th rule', () => {
  it.each([
    ['2026-04-20', due(2026, 4), 'the 20th closes the current month'],
    ['2026-04-21', due(2026, 5), 'the 21st opens the next month'],
    ['2026-03-21', due(2026, 4), "April's window opens 21 March"],
    ['2026-04-01', due(2026, 4), 'mid-window'],
    ['2026-12-20', due(2026, 12), 'December closes normally'],
    ['2026-12-21', due(2027, 1), 'December 21 rolls into January'],
    ['2027-01-20', due(2027, 1), "January's own deadline"],
    ['2028-02-29', due(2028, 3), 'a leap day past the 21st rolls into March'],
  ])('%s → %o (%s)', (input, expected) => {
    expect(dueMonthForCivilDate(parseCivilDate(input))).toEqual(expected)
  })

  it('maps the 20th/21st pair correctly for every month of a year', () => {
    for (let m = 1; m <= 12; m += 1) {
      const twentieth = dueMonthForCivilDate({ y: 2026, m, d: 20 })
      const twentyFirst = dueMonthForCivilDate({ y: 2026, m, d: 21 })

      expect(twentieth).toEqual(due(2026, m))
      expect(twentyFirst).toEqual(addMonths(due(2026, m), 1))
    }
  })
})

describe('dueMonthForInstant — the UTC off-by-one this module exists to prevent', () => {
  it('treats 17:59:59.999Z on the 20th as still inside that month', () => {
    // 2026-04-20T17:59:59.999Z is 2026-04-20 23:59:59.999 in Dhaka.
    expect(dueMonthForInstant(new Date('2026-04-20T17:59:59.999Z'))).toEqual(due(2026, 4))
  })

  it('treats 18:00:00.000Z on the 20th as the next month', () => {
    // 2026-04-20T18:00:00.000Z is 2026-04-21 00:00:00 in Dhaka — a new window.
    expect(dueMonthForInstant(new Date('2026-04-20T18:00:00.000Z'))).toEqual(due(2026, 5))
  })

  it('rolls the year over at the Dhaka boundary, not the UTC one', () => {
    expect(dueMonthForInstant(new Date('2026-12-20T18:00:00.000Z'))).toEqual(due(2027, 1))
  })

  it('currentDueMonth agrees with dueMonthForInstant', () => {
    const now = new Date('2026-09-21T06:00:00.000Z')
    expect(currentDueMonth(now)).toEqual(dueMonthForInstant(now))
  })
})

describe('dueWindow', () => {
  it("April 2026's window runs 21 March to 20 April", () => {
    const window = dueWindow(due(2026, 4))
    expect(formatCivilDate(window.startCivil)).toBe('2026-03-21')
    expect(formatCivilDate(window.endCivil)).toBe('2026-04-20')
  })

  it("January 2027's window opens on 21 December 2026", () => {
    const window = dueWindow(due(2027, 1))
    expect(formatCivilDate(window.startCivil)).toBe('2026-12-21')
  })

  it('expresses the boundaries as the expected UTC instants', () => {
    const window = dueWindow(due(2026, 4))
    // 21 March 00:00:00 Dhaka === 20 March 18:00:00 UTC
    expect(window.startInstant.toISOString()).toBe('2026-03-20T18:00:00.000Z')
    // 20 April 23:59:59.999 Dhaka === 20 April 17:59:59.999 UTC
    expect(window.endInstant.toISOString()).toBe('2026-04-20T17:59:59.999Z')
  })

  it('deadlineInstant is the end of the window', () => {
    expect(deadlineInstant(due(2026, 4)).toISOString()).toBe('2026-04-20T17:59:59.999Z')
  })

  it('leaves no gap between consecutive windows', () => {
    const april = dueWindow(due(2026, 4))
    const may = dueWindow(due(2026, 5))
    expect(may.startInstant.getTime() - april.endInstant.getTime()).toBe(1)
  })
})

describe('isWithinWindow / isBeforeWindow', () => {
  it('includes both endpoints', () => {
    expect(isWithinWindow(parseCivilDate('2026-03-21'), due(2026, 4))).toBe(true)
    expect(isWithinWindow(parseCivilDate('2026-04-20'), due(2026, 4))).toBe(true)
  })

  it('excludes the day either side', () => {
    expect(isWithinWindow(parseCivilDate('2026-03-20'), due(2026, 4))).toBe(false)
    expect(isWithinWindow(parseCivilDate('2026-04-21'), due(2026, 4))).toBe(false)
  })

  it('identifies a payment made before the window opened', () => {
    expect(isBeforeWindow(parseCivilDate('2026-03-20'), due(2026, 4))).toBe(true)
    expect(isBeforeWindow(parseCivilDate('2026-05-01'), due(2026, 4))).toBe(false)
  })
})

describe('database date conversion', () => {
  it('round-trips a civil date through the @db.Date representation', () => {
    const civil = parseCivilDate('2026-04-20')
    expect(dbDateToCivil(civilToDbDate(civil))).toEqual(civil)
  })

  it('stores a civil date as UTC midnight', () => {
    expect(civilToDbDate({ y: 2026, m: 4, d: 20 }).toISOString()).toBe('2026-04-20T00:00:00.000Z')
  })
})

describe('due month keys', () => {
  it('formats and parses', () => {
    expect(dueMonthKey(due(2026, 4))).toBe('2026-04')
    expect(parseDueMonthKey('2026-04')).toEqual(due(2026, 4))
  })

  it('sorts lexicographically in chronological order', () => {
    const keys = [due(2027, 1), due(2026, 4), due(2026, 12)].map(dueMonthKey)
    expect([...keys].sort()).toEqual(['2026-04', '2026-12', '2027-01'])
  })

  it('rejects malformed keys', () => {
    expect(() => parseDueMonthKey('2026-13')).toThrow(RangeError)
    expect(() => parseDueMonthKey('2026-4')).toThrow(RangeError)
  })
})

describe('dueMonthsBetween', () => {
  it('is inclusive and spans a year boundary', () => {
    expect(dueMonthsBetween(due(2026, 11), due(2027, 2))).toEqual([
      due(2026, 11),
      due(2026, 12),
      due(2027, 1),
      due(2027, 2),
    ])
  })

  it('returns a single month when both ends match', () => {
    expect(dueMonthsBetween(due(2026, 4), due(2026, 4))).toEqual([due(2026, 4)])
  })

  it('returns nothing when the range is inverted', () => {
    expect(dueMonthsBetween(due(2026, 5), due(2026, 4))).toEqual([])
  })
})

// ── Property tests ──────────────────────────────────────────────────────────

const arbCivilDate = fc
  .record({
    y: fc.integer({ min: 2020, max: 2040 }),
    m: fc.integer({ min: 1, max: 12 }),
    d: fc.integer({ min: 1, max: 31 }),
  })
  .filter((c): c is CivilDate => c.d <= daysInMonth(c.y, c.m))

const arbDueMonth = fc.record({
  dueYear: fc.integer({ min: 2020, max: 2040 }),
  dueMonth: fc.integer({ min: 1, max: 12 }),
})

describe('properties', () => {
  it('every date falls inside the window of its own derived due month', () => {
    fc.assert(
      fc.property(arbCivilDate, (c) => {
        expect(isWithinWindow(c, dueMonthForCivilDate(c))).toBe(true)
      }),
      { numRuns: 2000 },
    )
  })

  it('one millisecond past a deadline belongs to the next due month', () => {
    fc.assert(
      fc.property(arbDueMonth, (dm) => {
        const justAfter = new Date(deadlineInstant(dm).getTime() + 1)
        expect(dueMonthForInstant(justAfter)).toEqual(addMonths(dm, 1))
      }),
      { numRuns: 2000 },
    )
  })

  it('the deadline instant itself still belongs to its own due month', () => {
    fc.assert(
      fc.property(arbDueMonth, (dm) => {
        expect(dueMonthForInstant(deadlineInstant(dm))).toEqual(dm)
      }),
      { numRuns: 2000 },
    )
  })

  it('addMonths is reversible', () => {
    fc.assert(
      fc.property(arbDueMonth, fc.integer({ min: -60, max: 60 }), (dm, n) => {
        expect(addMonths(addMonths(dm, n), -n)).toEqual(dm)
      }),
      { numRuns: 2000 },
    )
  })

  it('agrees with Intl on which Dhaka day an instant falls on', () => {
    // Intl is the oracle here; the offset arithmetic is the implementation under
    // test. If Bangladesh ever adopts DST, this is the test that fails first.
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })

    fc.assert(
      fc.property(
        fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2040, 0, 1) }),
        (ms) => {
          const instant = new Date(ms)
          expect(formatCivilDate(instantToDhakaCivil(instant))).toBe(formatter.format(instant))
        },
      ),
      { numRuns: 10_000 },
    )
  })
})
