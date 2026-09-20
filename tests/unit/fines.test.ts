import { describe, expect, it } from 'vitest'
import { parseCivilDate, type DueMonth } from '@/lib/due-cycle'
import { FINE_PAISA, allocate, fineFor, isLate, isTooEarly, settlementStatus } from '@/lib/fines'

const due = (dueYear: number, dueMonth: number): DueMonth => ({ dueYear, dueMonth })
const on = parseCivilDate

describe('isLate', () => {
  it('is false on the deadline day itself', () => {
    expect(isLate(on('2026-04-20'), due(2026, 4))).toBe(false)
  })

  it('is true the day after the deadline', () => {
    expect(isLate(on('2026-04-21'), due(2026, 4))).toBe(true)
  })

  it('is true for a payment made a month later', () => {
    // The case the due-month selector exists for: April's due, sent 3 May.
    expect(isLate(on('2026-05-03'), due(2026, 4))).toBe(true)
  })

  it('is false early in the window', () => {
    expect(isLate(on('2026-03-21'), due(2026, 4))).toBe(false)
  })

  it('handles a December deadline paid in January', () => {
    expect(isLate(on('2027-01-05'), due(2026, 12))).toBe(true)
  })
})

describe('settlementStatus', () => {
  it('maps to the DuePayment statuses', () => {
    expect(settlementStatus(on('2026-04-20'), due(2026, 4))).toBe('PAID_ON_TIME')
    expect(settlementStatus(on('2026-04-21'), due(2026, 4))).toBe('PAID_LATE')
  })
})

describe('isTooEarly', () => {
  it('flags a payment made before the window opened', () => {
    expect(isTooEarly(on('2026-03-20'), due(2026, 4))).toBe(true)
  })

  it('accepts the first day of the window', () => {
    expect(isTooEarly(on('2026-03-21'), due(2026, 4))).toBe(false)
  })

  it('does not flag a late payment as early', () => {
    expect(isTooEarly(on('2026-05-03'), due(2026, 4))).toBe(false)
  })
})

describe('fineFor', () => {
  it('charges nothing for an on-time payment', () => {
    expect(fineFor(on('2026-04-20'), due(2026, 4))).toBe(0)
  })

  it('charges exactly ৳ 200 for a late payment', () => {
    expect(fineFor(on('2026-04-21'), due(2026, 4))).toBe(FINE_PAISA)
    expect(FINE_PAISA).toBe(20_000)
  })

  it('never doubles a fine the rollover job already levied', () => {
    // The member missed the deadline, the cron charged ৳ 200, and the late
    // payment is only now being approved. The fine must stay ৳ 200.
    expect(fineFor(on('2026-05-03'), due(2026, 4), FINE_PAISA)).toBe(FINE_PAISA)
  })

  it('does not compound however late the payment is', () => {
    expect(fineFor(on('2026-09-30'), due(2026, 4))).toBe(FINE_PAISA)
  })

  it('keeps an existing fine even when the payment was on time', () => {
    // An admin-adjusted fine is deliberate; approving a payment must not erase it.
    expect(fineFor(on('2026-04-20'), due(2026, 4), 5_000)).toBe(5_000)
  })
})

describe('allocate — due first, then fine, then surplus', () => {
  it('splits an exact payment of due plus fine', () => {
    expect(allocate(220_000, 200_000, FINE_PAISA)).toEqual({
      toDue: 200_000,
      toFine: 20_000,
      surplus: 0,
      shortfall: 0,
    })
  })

  it('pays the subscription before the fine when money is short', () => {
    expect(allocate(200_000, 200_000, FINE_PAISA)).toEqual({
      toDue: 200_000,
      toFine: 0,
      surplus: 0,
      shortfall: 20_000,
    })
  })

  it('books anything extra as surplus', () => {
    expect(allocate(250_000, 200_000, FINE_PAISA)).toEqual({
      toDue: 200_000,
      toFine: 20_000,
      surplus: 30_000,
      shortfall: 0,
    })
  })

  it('reports a shortfall on a partial payment', () => {
    expect(allocate(150_000, 200_000, 0)).toEqual({
      toDue: 150_000,
      toFine: 0,
      surplus: 0,
      shortfall: 50_000,
    })
  })

  it('treats a zero payment as owing everything', () => {
    expect(allocate(0, 200_000, FINE_PAISA)).toEqual({
      toDue: 0,
      toFine: 0,
      surplus: 0,
      shortfall: 220_000,
    })
  })

  it('conserves the amount paid across the split', () => {
    const paid = 217_345
    const { toDue, toFine, surplus } = allocate(paid, 200_000, FINE_PAISA)
    expect(toDue + toFine + surplus).toBe(paid)
  })
})
