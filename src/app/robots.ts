import type { MetadataRoute } from 'next'

/**
 * The fund and ledger pages are open to search engines — there is nothing
 * personal on them and they are the society's public face.
 *
 * The member directory and individual profiles are *not* indexed. They remain
 * readable by anyone with the link, which is what "open to the members" needs,
 * but a member's name paired with their contribution history should not surface
 * in a web search for that person's name. Remove the two `/members` rules if the
 * society decides it wants them indexed.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api', '/login', '/members', '/members/'],
      },
    ],
  }
}
