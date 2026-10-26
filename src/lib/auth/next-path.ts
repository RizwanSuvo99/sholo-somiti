/**
 * Validate a `?next=` destination before navigating to it.
 *
 * The value comes from the query string, so it is attacker-controlled. A
 * `startsWith('/')` check is not enough: a browser reads `//evil.test` as a
 * protocol-relative URL and follows it off-site, so a crafted login link could
 * bounce an admin to a copy of this panel and collect their password. It also
 * strips tabs and newlines out of URLs before resolving them, which is enough
 * to smuggle a host past a naive check.
 *
 * So: exactly one leading slash, and nothing a browser could reinterpret.
 */
export function safeNextPath(value: string | null | undefined, fallback = '/admin'): string {
  if (!value) return fallback

  // One leading slash followed by something that is not another slash or a
  // backslash — both of which can introduce a host.
  if (!/^\/[^/\\]/.test(value)) return fallback

  // Backslashes, control characters and raw whitespace are all either stripped
  // or normalised by browsers before the URL is resolved.
  if (/[\\\s]|[\u0000-\u001f\u007f]/.test(value)) return fallback

  return value
}
