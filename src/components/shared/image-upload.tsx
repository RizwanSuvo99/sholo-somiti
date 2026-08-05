'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

export type UploadedImage = { url: string; publicId: string }

/**
 * Uploads straight to Cloudinary using a signature fetched from our server, so
 * the file never passes through this app and the API secret never reaches the
 * browser.
 */
export function ImageUpload({
  signatureEndpoint,
  value,
  onChange,
  label,
  required,
}: {
  signatureEndpoint: string
  value: UploadedImage | null
  onChange: (image: UploadedImage | null) => void
  label: string
  required?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setError(null)

    if (!ALLOWED.includes(file.type)) {
      setError('ছবি JPG, PNG বা WEBP হতে হবে')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('ছবির আকার ৫ MB-এর কম হতে হবে')
      return
    }

    setBusy(true)
    try {
      const signatureResponse = await fetch(signatureEndpoint, { method: 'POST' })
      if (!signatureResponse.ok) throw new Error('signature')
      const signature = await signatureResponse.json()

      const form = new FormData()
      form.append('file', file)
      form.append('api_key', signature.apiKey)
      form.append('timestamp', String(signature.timestamp))
      form.append('signature', signature.signature)
      form.append('folder', signature.folder)

      const uploadResponse = await fetch(signature.endpoint, { method: 'POST', body: form })
      if (!uploadResponse.ok) throw new Error('upload')

      const result = await uploadResponse.json()
      onChange({ url: result.secure_url, publicId: result.public_id })
    } catch {
      setError('ছবি আপলোড করা যায়নি — আবার চেষ্টা করুন')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>

      {value ? (
        <div className="flex items-start gap-3">
          <Image
            src={value.url}
            alt=""
            width={96}
            height={96}
            className="h-24 w-24 rounded-lg border border-line object-cover"
            unoptimized
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => onChange(null)}>
            সরান
          </Button>
        </div>
      ) : (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED.join(',')}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? 'আপলোড হচ্ছে…' : 'ছবি বেছে নিন'}
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
