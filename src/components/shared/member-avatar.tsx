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
  shape = 'circle',
  ring = 'ring-1 ring-black/5',
  className,
}: {
  memberCode: string
  name: string
  photoUrl?: string | null
  size?: number
  /** Circles suit inline lists; the softer square reads better at card sizes. */
  shape?: 'circle' | 'squircle'
  /**
   * Passed rather than merged into `className`, because two competing `ring-*`
   * utilities would be resolved by stylesheet order rather than by the order
   * they are written here.
   */
  ring?: string
  className?: string
}) {
  const radius = shape === 'squircle' ? 'rounded-2xl' : 'rounded-full'

  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cn('shrink-0 object-cover', radius, ring, className)}
        unoptimized
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className={cn(
        'grid shrink-0 place-items-center bg-gradient-to-br font-semibold text-white',
        radius,
        ring,
        avatarTone(memberCode),
        className,
      )}
    >
      {name.slice(0, 1)}
    </span>
  )
}
