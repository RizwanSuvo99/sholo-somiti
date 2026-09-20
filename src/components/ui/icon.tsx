import type { SVGProps } from 'react'

/**
 * Inline SVG icons, stroked with `currentColor` so a tile's text colour carries
 * through. Kept inline rather than pulled from an icon package: there are only a
 * handful, and this avoids shipping a dependency for six glyphs.
 */

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconWallet = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2" />
    <path d="M3 8v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
    <path d="M21 11h-4a2 2 0 0 0 0 4h4v-4Z" />
  </Svg>
)

export const IconCoins = (props: IconProps) => (
  <Svg {...props}>
    <ellipse cx="9" cy="6.5" rx="6" ry="2.8" />
    <path d="M3 6.5v4c0 1.5 2.7 2.8 6 2.8s6-1.3 6-2.8v-4" />
    <path d="M15 13.2c3 .3 6 1.4 6 2.8v2c0 1.5-2.7 2.8-6 2.8s-6-1.3-6-2.8v-2" />
  </Svg>
)

export const IconAlert = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3.5 2.6 19.5h18.8L12 3.5Z" />
    <path d="M12 10v4" />
    <path d="M12 17.2h.01" />
  </Svg>
)

export const IconGift = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 11h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9Z" />
    <path d="M2 7.5h20V11H2z" />
    <path d="M12 7.5V21" />
    <path d="M12 7.5S10.5 3 8 3a2.2 2.2 0 0 0 0 4.5Z" />
    <path d="M12 7.5S13.5 3 16 3a2.2 2.2 0 0 1 0 4.5Z" />
  </Svg>
)

export const IconReceipt = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21V3Z" />
    <path d="M9 8h6" />
    <path d="M9 12h6" />
  </Svg>
)

export const IconUsers = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.5 19.5a6.5 6.5 0 0 1 13 0" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" />
    <path d="M17.6 14.2a6.5 6.5 0 0 1 3.9 5.3" />
  </Svg>
)

export const IconCalendar = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18" />
    <path d="M8 3v4M16 3v4" />
  </Svg>
)

export const IconCheck = (props: IconProps) => (
  <Svg {...props}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
)

export const IconArrowUp = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 19V5" />
    <path d="m5.5 11.5 6.5-6.5 6.5 6.5" />
  </Svg>
)

export const IconArrowDown = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 5v14" />
    <path d="m5.5 12.5 6.5 6.5 6.5-6.5" />
  </Svg>
)

export const IconGlobe = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3.2 9.5h17.6M3.2 14.5h17.6" />
    <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
  </Svg>
)
