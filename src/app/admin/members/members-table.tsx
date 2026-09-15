'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { ConfirmModal, Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { MemberAvatar } from '@/components/shared/member-avatar'
import { ImageUpload, type UploadedImage } from '@/components/shared/image-upload'
import { toBnDigits } from '@/lib/money'
import { civilDateLabel } from '@/lib/bn'
import { parseCivilDate } from '@/lib/due-cycle'

export type MemberRow = {
  id: string
  memberCode: string
  name: string
  fatherName: string
  mobile: string
  email: string
  /** `YYYY-MM-DD` — a plain string, so the row crosses to the client cleanly. */
  joinedOn: string
  photoUrl: string | null
  photoPublicId: string | null
  isActive: boolean
}

type Draft = Pick<MemberRow, 'name' | 'fatherName' | 'mobile' | 'email' | 'joinedOn'>

/**
 * The members table.
 *
 * Editing happens in a dialog rather than inside the row: the fields get room to
 * breathe and to carry their own labels and errors, and there is no chance of
 * half-typed changes sitting invisibly in a scrolled-off row. Deactivation asks
 * for confirmation in its own dialog, and both report the outcome as a toast.
 *
 * The member code is never editable — it is allocated once from a transactional
 * counter and historical dues reference it, so changing it would orphan them.
 */
export function MembersTable({ members }: { members: MemberRow[] }) {
  const router = useRouter()
  const toast = useToast()

  const [editing, setEditing] = useState<MemberRow | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [photo, setPhoto] = useState<UploadedImage | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<MemberRow | null>(null)
  const [pending, setPending] = useState(false)

  function openEditor(member: MemberRow) {
    setEditing(member)
    setFieldError(null)
    setPhoto(
      member.photoUrl ? { url: member.photoUrl, publicId: member.photoPublicId ?? '' } : null,
    )
    setDraft({
      name: member.name,
      fatherName: member.fatherName,
      mobile: member.mobile,
      email: member.email,
      joinedOn: member.joinedOn,
    })
  }

  function closeEditor() {
    setEditing(null)
    setDraft(null)
    setPhoto(null)
    setFieldError(null)
  }

  async function patch(member: MemberRow, body: Record<string, unknown>): Promise<boolean> {
    setPending(true)
    try {
      const response = await fetch(`/api/admin/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        toast.error(payload?.error?.messageBn ?? 'সংরক্ষণ করা যায়নি', member.memberCode)
        return false
      }

      router.refresh()
      return true
    } catch {
      toast.error('সংযোগে সমস্যা হয়েছে', member.memberCode)
      return false
    } finally {
      setPending(false)
    }
  }

  async function save() {
    if (!editing || !draft) return

    if (draft.name.trim() === '') {
      setFieldError('নাম খালি রাখা যাবে না')
      return
    }

    try {
      parseCivilDate(draft.joinedOn)
    } catch {
      setFieldError('যোগদানের তারিখ সঠিক নয়')
      return
    }

    setFieldError(null)

    const saved = await patch(editing, {
      name: draft.name.trim(),
      fatherName: draft.fatherName.trim(),
      mobile: draft.mobile.trim(),
      email: draft.email.trim(),
      joinedOn: draft.joinedOn,
      // Removing a photo clears it from the member record. The Cloudinary asset
      // itself is left in place — photoPublicId is kept so it can be cleaned up
      // deliberately rather than as a side effect of an edit.
      photoUrl: photo?.url ?? null,
      photoPublicId: photo?.publicId || null,
    })

    if (saved) {
      toast.success('সদস্যের তথ্য হালনাগাদ হয়েছে', `${editing.memberCode} — ${draft.name.trim()}`)
      closeEditor()
    }
  }

  async function toggleActive() {
    if (!confirming) return

    const next = !confirming.isActive
    const changed = await patch(confirming, { isActive: next })

    if (changed) {
      toast.success(
        next ? 'সদস্য আবার সক্রিয় হয়েছে' : 'সদস্য নিষ্ক্রিয় করা হয়েছে',
        next
          ? `${confirming.memberCode} এখন থেকে নতুন মাসের চাঁদার হিসাবে যুক্ত হবেন`
          : `${confirming.memberCode} — পুরোনো হিসাব অক্ষত আছে`,
      )
      setConfirming(null)
    }
  }

  const update = (patchDraft: Partial<Draft>) =>
    setDraft((current) => (current ? { ...current, ...patchDraft } : current))

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50/80 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-2.5 font-medium">সদস্য</th>
              <th className="px-4 py-2.5 font-medium">পিতার নাম</th>
              <th className="px-4 py-2.5 font-medium">মোবাইল</th>
              <th className="px-4 py-2.5 font-medium">যোগদান</th>
              <th className="px-4 py-2.5 font-medium">অবস্থা</th>
              <th className="px-4 py-2.5 text-right font-medium">কাজ</th>
            </tr>
          </thead>

          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-line last:border-0 hover:bg-surface">
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2.5">
                    <MemberAvatar
                      memberCode={member.memberCode}
                      name={member.name}
                      photoUrl={member.photoUrl}
                      size={32}
                    />
                    <span className="min-w-0">
                      <Link
                        href={`/admin/members/${member.id}`}
                        className="block truncate font-medium hover:text-brand hover:underline"
                      >
                        {member.name}
                      </Link>
                      <span className="block tabular text-xs text-muted">{member.memberCode}</span>
                    </span>
                  </span>
                </td>

                <td className="px-4 py-2.5">{member.fatherName || '—'}</td>

                <td className="px-4 py-2.5 tabular">
                  {member.mobile ? toBnDigits(member.mobile) : '—'}
                </td>

                <td className="px-4 py-2.5 whitespace-nowrap">
                  {civilDateLabel(parseCivilDate(member.joinedOn))}
                </td>

                <td className="px-4 py-2.5 whitespace-nowrap">
                  {member.isActive ? (
                    <span className="text-positive">সক্রিয়</span>
                  ) : (
                    <span className="text-muted">নিষ্ক্রিয়</span>
                  )}
                </td>

                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <span className="inline-flex gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openEditor(member)}
                      aria-label={`${member.name} সম্পাদনা করুন`}
                    >
                      সম্পাদনা
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirming(member)}
                      aria-label={`${member.name} ${member.isActive ? 'নিষ্ক্রিয়' : 'সক্রিয়'} করুন`}
                    >
                      {member.isActive ? 'নিষ্ক্রিয়' : 'সক্রিয়'}
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={editing !== null}
        onClose={closeEditor}
        title="সদস্যের তথ্য সম্পাদনা"
        description={editing ? `${editing.memberCode} — আইডি নম্বর পরিবর্তন করা যায় না` : undefined}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeEditor} disabled={pending}>
              বাতিল
            </Button>
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করুন'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="নাম" required error={fieldError?.startsWith('নাম') ? fieldError : undefined}>
            <Input value={draft?.name ?? ''} onChange={(e) => update({ name: e.target.value })} />
          </Field>

          <Field label="পিতার নাম">
            <Input
              value={draft?.fatherName ?? ''}
              onChange={(e) => update({ fatherName: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="মোবাইল">
              <Input
                inputMode="tel"
                value={draft?.mobile ?? ''}
                onChange={(e) => update({ mobile: e.target.value })}
              />
            </Field>
            <Field label="ইমেইল">
              <Input
                type="email"
                value={draft?.email ?? ''}
                onChange={(e) => update({ email: e.target.value })}
              />
            </Field>
          </div>

          <Field
            label="যোগদানের তারিখ"
            required
            error={fieldError?.startsWith('যোগদানের') ? fieldError : undefined}
            hint="কোন মাস থেকে চাঁদা প্রযোজ্য তা এই তারিখ থেকে নির্ধারিত হয়"
          >
            <Input
              type="date"
              value={draft?.joinedOn ?? ''}
              onChange={(e) => update({ joinedOn: e.target.value })}
            />
          </Field>

          <div className="border-t border-line pt-4">
            <ImageUpload
              label="সদস্যের ছবি"
              signatureEndpoint="/api/admin/uploads/signature"
              value={photo}
              onChange={setPhoto}
            />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={toggleActive}
        pending={pending}
        tone={confirming?.isActive ? 'danger' : 'primary'}
        title={confirming?.isActive ? 'সদস্য নিষ্ক্রিয় করবেন?' : 'সদস্য সক্রিয় করবেন?'}
        confirmLabel={confirming?.isActive ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
        description={
          confirming?.isActive
            ? `${confirming.name} (${confirming.memberCode}) আর নতুন মাসের চাঁদার হিসাবে যুক্ত হবেন না। পুরোনো সব হিসাব অক্ষত থাকবে এবং চাইলে আবার সক্রিয় করা যাবে।`
            : confirming
              ? `${confirming.name} (${confirming.memberCode}) আবার নতুন মাসের চাঁদার হিসাবে যুক্ত হবেন।`
              : undefined
        }
      />
    </>
  )
}
