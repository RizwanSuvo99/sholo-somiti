import 'server-only'
import { createHash } from 'node:crypto'
import { env } from './env'

/**
 * Cloudinary signed direct upload.
 *
 * The browser uploads straight to Cloudinary, so large screenshots never pass
 * through this server. What the browser receives is a signature scoped to one
 * folder and one timestamp — never the API secret, which stays server-side.
 */

export type UploadFolder = 'sholo/members' | 'sholo/submissions'

export type UploadSignature = {
  cloudName: string
  apiKey: string
  timestamp: number
  signature: string
  folder: UploadFolder
}

export function signUpload(folder: UploadFolder): UploadSignature {
  const timestamp = Math.floor(Date.now() / 1000)

  // Cloudinary signs the alphabetically sorted parameter string plus the secret.
  const toSign = `folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`
  const signature = createHash('sha1').update(toSign).digest('hex')

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    signature,
    folder,
  }
}

export function uploadEndpoint(cloudName: string): string {
  return `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
}

/** Accepted image types and the size ceiling for an upload. */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
