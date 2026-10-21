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
 * page: an off-host link is phishing with the society's own wording, and a
 * file:// or UNC path makes Excel on Windows open an SMB handshake — leaking an
 * NTLM hash — to whichever server the submitter named.
 *
 * A value that fails this check is kept, not dropped, and shown as plain text,
 * so nothing is hidden from the admin reviewing it.
 */
export const ALLOWED_UPLOAD_HOSTS: readonly string[] = ['res.cloudinary.com']

export function isAllowedUploadUrl(value: string | null | undefined): boolean {
  if (!value) return false

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  return url.protocol === 'https:' && ALLOWED_UPLOAD_HOSTS.includes(url.hostname)
}
