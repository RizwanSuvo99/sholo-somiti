/**
 * Where an uploaded payment proof is allowed to live.
 *
 * The browser uploads straight to Cloudinary with a server-signed signature and
 * then posts the resulting delivery URL back, so the URL arrives from the
 * client and is only as trustworthy as the client. `z.string().url()` accepts
 * `file://a-server/share/x.jpg` and `https://attacker.test/x.jpg` just as
 * happily as a real one.
 *
 * That matters because an admin meets this value later as a one-click
 * "ছবি দেখুন" link in the monthly report, and as an <img src> on the review
 * page: an off-host link is phishing in the society's own wording, and a
 * file:// or UNC path makes Excel on Windows open an SMB handshake — leaking an
 * NTLM hash — to whichever server the submitter named.
 *
 * A value that fails this check is kept, not dropped, and shown as plain text,
 * so nothing is hidden from the admin reviewing it.
 */
export const ALLOWED_UPLOAD_HOSTS: readonly string[] = ['res.cloudinary.com']

/**
 * The society's own Cloudinary cloud, read at call time rather than imported
 * from `@/lib/env`, which is `server-only` and would drag a React Server
 * Component marker into plain unit tests. Unset (only in tests) falls back to
 * the host check alone.
 */
function configuredCloudName(): string | undefined {
  const name = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  return name ? name : undefined
}

export function isAllowedUploadUrl(value: string | null | undefined): boolean {
  if (!value) return false

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  // Every check below reads the *parsed* URL while the caller goes on to use
  // the raw string. URL parsing rewrites as it goes — it strips tabs and
  // newlines, turns a backslash into a slash, percent-encodes — so a string
  // that parses to an allowed host need not be the string Excel resolves.
  // Requiring the canonical form closes that gap for the whole class.
  if (url.href !== value) return false

  // `https://attacker.test@res.cloudinary.com/x` parses to an allowed host but
  // reads as the attacker's domain to anyone glancing at it.
  if (url.username || url.password) return false

  if (url.protocol !== 'https:') return false
  if (!ALLOWED_UPLOAD_HOSTS.includes(url.hostname)) return false

  // res.cloudinary.com serves every Cloudinary tenant, so the host alone would
  // also accept an image from somebody else's account. The cloud name is the
  // first path segment of a delivery URL.
  const cloud = configuredCloudName()
  return cloud ? url.pathname.startsWith(`/${cloud}/`) : true
}
