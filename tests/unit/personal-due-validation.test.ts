import { describe, expect, test } from 'vitest'
import {
  personalLoanSchema,
  personalRepaymentSchema,
} from '@/lib/validation/personal-due'

/**
 * The lending forms accept what a person actually types — Bengali digits, a ৳
 * sign, a member code without its dash — and convert to paisa at this one
 * point. These assertions pin that boundary, because a taka value that reaches
 * the service un-converted would be stored a hundred times too small.
 */

const VALID_LOAN = { memberCode: 'NHSS-25001', amount: '5000', lentOn: '2026-01-10' }

describe('personalLoanSchema', () => {
  test('a taka amount is converted to paisa', () => {
    const parsed = personalLoanSchema.parse(VALID_LOAN)
    expect(parsed.amount).toBe(500_000)
  })

  test('accepts Bengali digits, a ৳ sign and thousands separators', () => {
    const parsed = personalLoanSchema.parse({ ...VALID_LOAN, amount: '৳৫,০০০' })
    expect(parsed.amount).toBe(500_000)
  })

  test('a member code typed without its dash is normalised', () => {
    const parsed = personalLoanSchema.parse({ ...VALID_LOAN, memberCode: 'nhss25001' })
    expect(parsed.memberCode).toBe('NHSS-25001')
  })

  test('the date is carried as a CivilDate, not a Date', () => {
    const parsed = personalLoanSchema.parse(VALID_LOAN)
    expect(parsed.lentOn).toEqual({ y: 2026, m: 1, d: 10 })
  })

  test('zero is rejected', () => {
    const result = personalLoanSchema.safeParse({ ...VALID_LOAN, amount: '0' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['amount'])
  })

  test('a negative amount is rejected', () => {
    expect(personalLoanSchema.safeParse({ ...VALID_LOAN, amount: '-100' }).success).toBe(false)
  })

  test('a date that is not a real day is rejected', () => {
    const result = personalLoanSchema.safeParse({ ...VALID_LOAN, lentOn: '2026-02-30' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['lentOn'])
  })

  test('an empty member code is rejected', () => {
    expect(personalLoanSchema.safeParse({ ...VALID_LOAN, memberCode: '  ' }).success).toBe(false)
  })

  test('the note is optional and trimmed', () => {
    expect(personalLoanSchema.parse(VALID_LOAN).note).toBeUndefined()
    expect(personalLoanSchema.parse({ ...VALID_LOAN, note: '  ঈদের আগে  ' }).note).toBe('ঈদের আগে')
  })
})

describe('personalRepaymentSchema', () => {
  test('names its date field paidOn, so a repayment cannot be posted as a loan', () => {
    const parsed = personalRepaymentSchema.parse({
      memberCode: 'NHSS-25001',
      amount: '1200',
      paidOn: '2026-03-05',
    })
    expect(parsed).toMatchObject({
      memberCode: 'NHSS-25001',
      amount: 120_000,
      paidOn: { y: 2026, m: 3, d: 5 },
    })
  })

  test('a missing date is rejected', () => {
    const result = personalRepaymentSchema.safeParse({
      memberCode: 'NHSS-25001',
      amount: '1200',
    })
    expect(result.success).toBe(false)
  })
})
