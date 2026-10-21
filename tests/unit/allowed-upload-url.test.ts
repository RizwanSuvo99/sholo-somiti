import { afterEach, describe, expect, it } from 'vitest'
import { isAllowedUploadUrl } from '@/lib/uploads/allowed-url'

const OURS = 'https://res.cloudinary.com/djxs2inet/image/upload/v1/sholo/a.jpg'

afterEach(() => {
  delete process.env.CLOUDINARY_CLOUD_NAME
})

describe('allowed upload URLs', () => {
  it('accepts a proof delivered over https from the upload host', () => {
    expect(isAllowedUploadUrl(OURS)).toBe(true)
  })

  it.each([
    ['http://res.cloudinary.com/djxs2inet/a.jpg', 'plain http could be tampered with in transit'],
    ['file://a-server/share/a.jpg', 'Excel would open an SMB handshake and leak an NTLM hash'],
    ['//res.cloudinary.com/djxs2inet/a.jpg', 'protocol-relative, not an absolute URL'],
    ['https://attacker.test/a.jpg', 'another host entirely'],
    ['https://res.cloudinary.com.attacker.test/a.jpg', 'a suffix that only looks like the host'],
    ['https://attacker.test/?x=res.cloudinary.com', 'the host hidden in a query string'],
    ['javascript:alert(1)', 'not a URL to fetch at all'],
    ['', 'empty'],
  ])('rejects %s — %s', (value) => {
    expect(isAllowedUploadUrl(value)).toBe(false)
  })

  it('rejects a missing value without throwing', () => {
    expect(isAllowedUploadUrl(null)).toBe(false)
    expect(isAllowedUploadUrl(undefined)).toBe(false)
  })

  describe('a string that parses to something other than itself', () => {
    // The caller validates the parsed URL and then hands the raw string to
    // Excel, so anything the parser rewrites must be refused outright.
    it.each([
      ['https://res.cloudinary.com\t.attacker.test/a.jpg', 'a stripped tab'],
      ['https://res.cloudinary.com\n@attacker.test/a.jpg', 'a stripped newline'],
      ['https://res.cloudinary.com\\@attacker.test/a.jpg', 'a backslash read as a slash'],
      ['https://res.cloudinary.com/djxs2inet/a"b.jpg', 'a quote that percent-encodes'],
      ['https://RES.CLOUDINARY.COM/djxs2inet/a.jpg', 'a host that lowercases'],
    ])('rejects %j — %s', (value) => {
      expect(isAllowedUploadUrl(value)).toBe(false)
    })

    it('rejects credentials in front of an otherwise allowed host', () => {
      expect(isAllowedUploadUrl('https://attacker.test@res.cloudinary.com/djxs2inet/a.jpg')).toBe(
        false,
      )
    })
  })

  describe('when the society’s cloud name is configured', () => {
    it('accepts a proof in our own cloud', () => {
      process.env.CLOUDINARY_CLOUD_NAME = 'djxs2inet'
      expect(isAllowedUploadUrl(OURS)).toBe(true)
    })

    it('rejects one in another tenant’s cloud on the same shared host', () => {
      process.env.CLOUDINARY_CLOUD_NAME = 'djxs2inet'
      expect(
        isAllowedUploadUrl('https://res.cloudinary.com/attacker-cloud/image/upload/a.jpg'),
      ).toBe(false)
    })

    it('is not fooled by a cloud name that merely starts the same way', () => {
      process.env.CLOUDINARY_CLOUD_NAME = 'djxs2inet'
      expect(
        isAllowedUploadUrl('https://res.cloudinary.com/djxs2inet-evil/image/upload/a.jpg'),
      ).toBe(false)
    })
  })
})
