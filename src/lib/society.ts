/**
 * The society's own details, shown on the public pages.
 *
 * Kept as a single constant so the account number appears in exactly one place
 * in the codebase. If the society ever changes bank, this is the only edit — and
 * making it admin-editable later means replacing this module with a settings
 * row, with no change to the components that render it.
 */

export const SOCIETY = {
  name: 'ষোলো সমবায় সমিতি',
  shortName: 'ষোলো',
} as const

/**
 * The first month the society collected dues for.
 *
 * Nothing before this exists to import or settle, so it is the floor for every
 * historical backfill. Enforced on the server as well as in the pickers — a
 * disabled option in a form is a convenience, not a guarantee.
 */
export const COLLECTION_START = { dueYear: 2025, dueMonth: 11 } as const

export type BankField = {
  label: string
  value: string
  /**
   * Identifiers a member will retype into a banking app. These must render in
   * Latin digits and be copyable verbatim — converting an account number to
   * Bengali numerals would invite a mistyped transfer.
   */
  verbatim?: boolean
}

export const BANK_ACCOUNT = {
  bankName: 'BRAC BANK',
  accountName: 'SHOLO FOUNDATION',
  accountNumber: '2077472630001',
  branch: 'Cumilla SME/Krishi Branch',
  location: 'Chawkbazar, Cumilla',
  routingNumber: '060191162',
  swiftCode: 'BRAKBDDH',
} as const

/** Rendered in this order on every page that shows the account. */
export const BANK_FIELDS: BankField[] = [
  { label: 'ব্যাংকের নাম', value: BANK_ACCOUNT.bankName },
  { label: 'হিসাবের নাম', value: BANK_ACCOUNT.accountName },
  { label: 'হিসাব নম্বর', value: BANK_ACCOUNT.accountNumber, verbatim: true },
  { label: 'শাখা', value: BANK_ACCOUNT.branch },
  { label: 'রাউটিং নম্বর', value: BANK_ACCOUNT.routingNumber, verbatim: true },
  { label: 'সুইফট কোড', value: BANK_ACCOUNT.swiftCode, verbatim: true },
  { label: 'ঠিকানা', value: BANK_ACCOUNT.location },
]
