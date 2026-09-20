import Image from 'next/image'
import Link from 'next/link'
import { StatusBadge } from '@/components/shared/status-badge'
import { avatarTone } from '@/components/shared/member-avatar'
import { formatBDT } from '@/lib/money'
import { civilDateLabel } from '@/lib/bn'
import type { CivilDate } from '@/lib/due-cycle'

export type MemberCardData = {
  memberCode: string
  name: string
  photoUrl: string | null
  joinedOn: CivilDate
  totalContributedPaisa: number
  currentMonthStatus: string
}

/**
 * A member in the public directory, led by their photo.
 *
 * The portrait fills the top of the card at its full width, with the name laid
 * over a scrim rather than beside a thumbnail. A photograph can be any colour,
 * so the text sits on a gradient that darkens towards the bottom — that keeps
 * the name legible over a bright sky or a white shirt without dimming the
 * whole image.
 *
 * Members without a photo get the same footprint filled with their initial, so
 * the grid stays even whether or not everyone has uploaded one.
 */
export function MemberCard({ member }: { member: MemberCardData }) {
  return (
    <Link
      href={`/members/${member.memberCode}`}
      className="group block overflow-hidden rounded-2xl border border-line bg-panel shadow-tile transition duration-200 hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="relative aspect-4/5 w-full overflow-hidden bg-slate-100 dark:bg-white/5">
        {member.photoUrl ? (
          <Image
            src={member.photoUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw"
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
            unoptimized
          />
        ) : (
          <span
            aria-hidden="true"
            className={`grid size-full place-items-center bg-gradient-to-br ${avatarTone(member.memberCode)} text-7xl font-bold text-white/90`}
          >
            {member.name.slice(0, 1)}
          </span>
        )}

        {/* The badge keeps its own opaque tint rather than being given a white
            background here: two competing bg-* utilities would be resolved by
            stylesheet order, not by the order they are written. */}
        <span className="absolute top-3 right-3">
          <StatusBadge status={member.currentMonthStatus} className="shadow-sm" />
        </span>

        {/* Scrim: without it the name is unreadable over a light photograph. */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-4 pt-12">
          <p className="truncate text-lg font-semibold text-white drop-shadow-sm">{member.name}</p>
          <p className="tabular text-xs text-white/75">{member.memberCode}</p>
        </div>
      </div>

      <div className="flex items-end justify-between gap-2 px-4 py-3">
        <div>
          <p className="text-xs text-muted">মোট জমা</p>
          <p className="text-lg font-bold tabular text-emerald-800 dark:text-emerald-300">
            {formatBDT(member.totalContributedPaisa)}
          </p>
        </div>
        <p className="text-right text-xs leading-snug text-muted">
          সদস্য
          <br />
          {civilDateLabel(member.joinedOn)} থেকে
        </p>
      </div>
    </Link>
  )
}
