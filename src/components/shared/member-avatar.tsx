import Image from 'next/image'
import { cn } from '@/lib/cn'

/** A stable colour per member, so each avatar keeps its own identity. */
const TONES = [
  'from-emerald-500 to-teal-600',
  'from-sky-500 to-indigo-600',
  'from-violet-500 to-fuchsia-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-blue-600',
]

export function avatarTone(memberCode: string): string {
  const digits = Number(memberCode.replace(/\D/g, '').slice(-3)) || 0
  return TONES[digits % TONES.length]
}

/**
 * A member's photo, or a coloured initial when there is none.
 *
 * Always decorative: every place it is used states the member's name and code in
 * adjacent text, so the image carries an empty alt rather than repeating them to
 * a screen reader.
 */
export function MemberAvatar({
  memberCode,
  name,
  photoUrl,
  size = 32,
  className,
}: {
  memberCode: string
  name: string
  photoUrl?: string | null
  size?: number
  className?: string
}) {
  const shared = 'shrink-0 rounded-full object-cover ring-1 ring-black/5'

  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cn(shared, className)}
        unoptimized
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white ring-1 ring-black/5',
        avatarTone(memberCode),
        className,
      )}
    >
      {name.slice(0, 1)}
    </span>
  )
}
