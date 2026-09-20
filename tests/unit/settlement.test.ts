import { describe, expect, it } from 'vitest'
import { fineOwedFor, planSettlement, totalOwed, type OutstandingMonth } from '@/lib/settlement'
import { parseCivilDate } from '@/lib/due-cycle'
import { FINE_PAISA } from '@/lib/fines'

const DUE = 50_000 // ৳500

const nov: OutstandingMonth = { dueYear: 2025, dueMonth: 11, duePaisa: DUE, finePaisa: FINE_PAISA }
const dec: OutstandingMonth = { dueYear: 2025, dueMonth: 12, duePaisa: DUE, finePaisa: 0 }

describe('totalOwed', () => {
  it('adds dues and fines across months', () => {
    // The case from the brief: a missed month, its fine, and the next month.
    expect(totalOwed([nov, dec])).toBe(DUE + FINE_PAISA + DUE)
    expect(totalOwed([nov, dec])).toBe(120_000) // ৳1,200
  })

  it('is zero for nothing owed', () => {
    expect(totalOwed([])).toBe(0)
  })

  it('charges a separate fine for each consecutive month missed', () => {
    // Three months missed, then paid in the fourth: three fines, not one, and
    // not a fine that grew. The ৳200 is flat per month.
    const missed = [11, 12, 1].map((dueMonth, index) => ({
      dueYear: dueMonth === 1 ? 2026 : 2025,
      dueMonth,
      duePaisa: DUE,
      finePaisa: FINE_PAISA,
      _order: index,
    }))
    const current = { dueYear: 2026, dueMonth: 2, duePaisa: DUE, finePaisa: 0 }

    expect(totalOwed([...missed, current])).toBe(DUE * 4 + FINE_PAISA * 3)
    expect(totalOwed([...missed, current])).toBe(260_000) // ৳2,600
  })
})

describe('planSettlement', () => {
  it('clears everything when the full amount is paid', () => {
    const plan = planSettlement([nov, dec], 120_000)

    expect(plan.shortfallPaisa).toBe(0)
    expect(plan.surplusPaisa).toBe(0)
    expect(plan.allocations).toEqual([
      { ...nov, toDue: DUE, toFine: FINE_PAISA, dueSettled: true },
      { ...dec, toDue: DUE, toFine: 0, dueSettled: true },
    ])
  })

  it('settles the oldest month first', () => {
    // Enough for November's due and fine, nothing left for December.
    const plan = planSettlement([dec, nov], DUE + FINE_PAISA)

    expect(plan.allocations.map((a) => a.dueMonth)).toEqual([11, 12])
    expect(plan.allocations[0]).toMatchObject({ dueMonth: 11, toDue: DUE, toFine: FINE_PAISA })
    expect(plan.allocations[1]).toMatchObject({ dueMonth: 12, toDue: 0, toFine: 0 })
    expect(plan.shortfallPaisa).toBe(DUE)
  })

  it('pays a subscription before its own fine', () => {
    // Only enough for the subscription: the month is settled, the fine is not.
    const plan = planSettlement([nov], DUE)

    expect(plan.allocations[0]).toMatchObject({ toDue: DUE, toFine: 0, dueSettled: true })
    expect(plan.shortfallPaisa).toBe(FINE_PAISA)
  })

  it('leaves a month open when its subscription is only part paid', () => {
    const plan = planSettlement([nov], 20_000)

    expect(plan.allocations[0]).toMatchObject({ toDue: 20_000, toFine: 0, dueSettled: false })
    expect(plan.shortfallPaisa).toBe(DUE - 20_000 + FINE_PAISA)
  })

  it('does not spend a later month before an earlier one is clear', () => {
    // A short payment must not skip ahead and leave the older debt behind.
    const plan = planSettlement([nov, dec], 30_000)

    expect(plan.allocations[0]).toMatchObject({ toDue: 30_000, toFine: 0 })
    expect(plan.allocations[1]).toMatchObject({ toDue: 0, toFine: 0 })
  })

  it('reports anything paid beyond what is owed', () => {
    const plan = planSettlement([dec], DUE + 7_000)

    expect(plan.surplusPaisa).toBe(7_000)
    expect(plan.shortfallPaisa).toBe(0)
  })

  it('conserves the amount paid', () => {
    const paid = 97_531
    const plan = planSettlement([nov, dec], paid)
    const applied = plan.allocations.reduce((sum, a) => sum + a.toDue + a.toFine, 0)

    expect(applied + plan.surplusPaisa).toBe(paid)
  })

  it('handles a zero payment without inventing an allocation', () => {
    const plan = planSettlement([nov], 0)

    expect(plan.allocations[0]).toMatchObject({ toDue: 0, toFine: 0, dueSettled: false })
    expect(plan.shortfallPaisa).toBe(DUE + FINE_PAISA)
    expect(plan.surplusPaisa).toBe(0)
  })

  it('treats a negative amount as nothing paid', () => {
    expect(planSettlement([nov], -500).surplusPaisa).toBe(0)
  })

  it('clears three missed months and their three fines in one payment', () => {
    const months: OutstandingMonth[] = [
      { dueYear: 2025, dueMonth: 11, duePaisa: DUE, finePaisa: FINE_PAISA },
      { dueYear: 2025, dueMonth: 12, duePaisa: DUE, finePaisa: FINE_PAISA },
      { dueYear: 2026, dueMonth: 1, duePaisa: DUE, finePaisa: FINE_PAISA },
      { dueYear: 2026, dueMonth: 2, duePaisa: DUE, finePaisa: 0 },
    ]

    const plan = planSettlement(months, 260_000)

    expect(plan.shortfallPaisa).toBe(0)
    expect(plan.surplusPaisa).toBe(0)
    expect(plan.allocations.every((a) => a.dueSettled)).toBe(true)
    expect(plan.allocations.map((a) => a.toFine)).toEqual([
      FINE_PAISA,
      FINE_PAISA,
      FINE_PAISA,
      0,
    ])
  })

  it('works through a long backlog oldest first when part paid', () => {
    const months: OutstandingMonth[] = [
      { dueYear: 2025, dueMonth: 11, duePaisa: DUE, finePaisa: FINE_PAISA },
      { dueYear: 2025, dueMonth: 12, duePaisa: DUE, finePaisa: FINE_PAISA },
      { dueYear: 2026, dueMonth: 1, duePaisa: DUE, finePaisa: FINE_PAISA },
    ]

    // Enough for the first month in full and the second month's subscription.
    const plan = planSettlement(months, DUE + FINE_PAISA + DUE)

    expect(plan.allocations[0]).toMatchObject({ toDue: DUE, toFine: FINE_PAISA, dueSettled: true })
    expect(plan.allocations[1]).toMatchObject({ toDue: DUE, toFine: 0, dueSettled: true })
    expect(plan.allocations[2]).toMatchObject({ toDue: 0, toFine: 0, dueSettled: false })
    expect(plan.shortfallPaisa).toBe(FINE_PAISA + DUE + FINE_PAISA)
  })

  it('returns an empty plan when nothing is owed', () => {
    const plan = planSettlement([], 50_000)

    expect(plan.allocations).toEqual([])
    expect(plan.surplusPaisa).toBe(50_000)
    expect(plan.totalOwedPaisa).toBe(0)
  })
})

describe('fineOwedFor', () => {
  const november = { dueYear: 2025, dueMonth: 11 }

  it('charges nothing when the money was sent before the deadline', () => {
    expect(fineOwedFor(november, parseCivilDate('2025-11-20'), 0)).toBe(0)
  })

  it('charges ৳200 when it was sent after the deadline', () => {
    expect(fineOwedFor(november, parseCivilDate('2025-11-21'), 0)).toBe(FINE_PAISA)
  })

  it('uses the fine already on the ledger rather than re-deriving it', () => {
    // The rollover job levied this; re-deriving could contradict the record.
    expect(fineOwedFor(november, parseCivilDate('2025-11-20'), FINE_PAISA)).toBe(FINE_PAISA)
  })

  it('subtracts what has already been paid towards a fine', () => {
    expect(fineOwedFor(november, parseCivilDate('2026-01-05'), FINE_PAISA, 5_000)).toBe(15_000)
  })

  it('never returns a negative amount', () => {
    expect(fineOwedFor(november, parseCivilDate('2026-01-05'), FINE_PAISA, 99_000)).toBe(0)
  })
})
