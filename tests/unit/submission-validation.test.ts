import { describe, expect, it } from 'vitest'
import { createSubmissionSchema } from '@/lib/validation/submission'

const valid = {
  memberCode: 'NHSS-25001',
  name: 'আব্দুল ইসলাম',
  sendingDate: '2026-10-12',
  amount: '500',
  transactionRef: 'TXN12345',
  paymentMedium: 'MOBILE_BANKING' as const,
  mobileBankingProvider: 'BKASH' as const,
  mobileBankingNumber: '01700000000',
  screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/v1/sholo/a.jpg',
}

const errorFor = (screenshotUrl: string) => {
  const result = createSubmissionSchema.safeParse({ ...valid, screenshotUrl })
  return result.success ? null : result.error.issues[0]
}

describe('public submission — proof URL', () => {
  it('accepts a proof on the upload host', () => {
    expect(createSubmissionSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    'https://attacker.test/a.jpg',
    'file://a-server/share/a.jpg',
    'http://res.cloudinary.com/demo/a.jpg',
    'https://res.cloudinary.com.attacker.test/a.jpg',
  ])('refuses a proof pointing at %s', (url) => {
    const issue = errorFor(url)

    // This endpoint is public, so the host cannot be left to the caller: the
    // stored URL is later a clickable link in the admin's monthly report.
    expect(issue?.path).toEqual(['screenshotUrl'])
    expect(issue?.message).toBe('ছবির লিংক সঠিক নয় — আবার আপলোড করুন')
  })
})
