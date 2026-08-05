'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/alert'
import { ImageUpload, type UploadedImage } from '@/components/shared/image-upload'

export type MemberFormValues = {
  id?: string
  name: string
  fatherName: string
  mobile: string
  email: string
  joinedOn: string
  photoUrl: string | null
  photoPublicId: string | null
}

export function MemberForm({ initial }: { initial?: MemberFormValues }) {
  const router = useRouter()
  const editing = Boolean(initial?.id)

  const [photo, setPhoto] = useState<UploadedImage | null>(
    initial?.photoUrl ? { url: initial.photoUrl, publicId: initial.photoPublicId ?? '' } : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const data = new FormData(event.currentTarget)
    const payload = {
      name: String(data.get('name') ?? ''),
      fatherName: String(data.get('fatherName') ?? ''),
      mobile: String(data.get('mobile') ?? ''),
      email: String(data.get('email') ?? ''),
      joinedOn: String(data.get('joinedOn') ?? ''),
      photoUrl: photo?.url ?? null,
      photoPublicId: photo?.publicId ?? null,
    }

    try {
      const response = await fetch(
        editing ? `/api/admin/members/${initial!.id}` : '/api/admin/members',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        setError(result?.error?.messageBn ?? 'সংরক্ষণ করা যায়নি')
        return
      }

      const member = await response.json()
      router.push(`/admin/members/${member.id}`)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <Field label="নাম" required>
        <Input name="name" defaultValue={initial?.name} required autoFocus />
      </Field>

      <Field label="পিতার নাম">
        <Input name="fatherName" defaultValue={initial?.fatherName} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="মোবাইল">
          <Input name="mobile" inputMode="tel" defaultValue={initial?.mobile} />
        </Field>
        <Field label="ইমেইল">
          <Input name="email" type="email" defaultValue={initial?.email} />
        </Field>
      </div>

      <Field
        label="যোগদানের তারিখ"
        required
        hint="আইডি নম্বরের সালের অংশ এবং কোন মাস থেকে চাঁদা প্রযোজ্য, তা এই তারিখ থেকে নির্ধারিত হয়"
      >
        <Input name="joinedOn" type="date" defaultValue={initial?.joinedOn} required />
      </Field>

      <ImageUpload
        label="ছবি"
        signatureEndpoint="/api/admin/uploads/signature"
        value={photo}
        onChange={setPhoto}
      />

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'সংরক্ষণ হচ্ছে…' : editing ? 'পরিবর্তন সংরক্ষণ করুন' : 'সদস্য যোগ করুন'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          বাতিল
        </Button>
      </div>
    </form>
  )
}
