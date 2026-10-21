import { describe, expect, it } from 'vitest'
import { isAllowedUploadUrl } from '@/lib/uploads/allowed-url'

describe('allowed upload URLs', () => {
  it('accepts a Cloudinary delivery URL over https', () => {
    expect(
      isAllowedUploadUrl('https://res.cloudinary.com/djxs2inet/image/upload/v1/sholo/a.jpg'),
    ).toBe(true)
  })

  it.each([
    ['http://res.cloudinary.com/x/a.jpg', 'plain http, so the link could be tampered with'],
    ['file://a-server/share/a.jpg', 'Excel would open an SMB handshake and leak an NTLM hash'],
    ['//res.cloudinary.com/x/a.jpg', 'protocol-relative, not a parseable absolute URL'],
    ['https://attacker.test/a.jpg', 'another host entirely'],
    ['https://res.cloudinary.com.attacker.test/a.jpg', 'suffix that only looks like the host'],
    ['https://attacker.test/?x=res.cloudinary.com', 'the host in a query string'],
    ['javascript:alert(1)', 'not a URL to fetch at all'],
    ['', 'empty'],
  ])('rejects %s — %s', (value) => {
    expect(isAllowedUploadUrl(value)).toBe(false)
  })

  it('rejects a missing value without throwing', () => {
    expect(isAllowedUploadUrl(null)).toBe(false)
    expect(isAllowedUploadUrl(undefined)).toBe(false)
  })
})
