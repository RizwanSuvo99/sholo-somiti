import { toBnDigits } from './money'
import type { CivilDate, DueMonth } from './due-cycle'

/** Bengali month names, indexed 1–12. */
export const BN_MONTHS = [
  '', 'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
] as const

export function monthNameBn(month: number): string {
  return BN_MONTHS[month] ?? ''
}

/** `এপ্রিল ২০২৬` */
export function dueMonthLabel(dm: DueMonth): string {
  return `${monthNameBn(dm.dueMonth)} ${toBnDigits(dm.dueYear)}`
}

/** `২০ এপ্রিল ২০২৬` */
export function civilDateLabel(c: CivilDate): string {
  return `${toBnDigits(c.d)} ${monthNameBn(c.m)} ${toBnDigits(c.y)}`
}

export const DUE_STATUS_BN: Record<string, string> = {
  PENDING: 'বাকি',
  PAID_ON_TIME: 'সময়মতো পরিশোধিত',
  PAID_LATE: 'বিলম্বে পরিশোধিত',
  UNPAID: 'অপরিশোধিত',
}

export const SUBMISSION_STATUS_BN: Record<string, string> = {
  PENDING: 'অপেক্ষমাণ',
  APPROVED: 'অনুমোদিত',
  REJECTED: 'প্রত্যাখ্যাত',
}

export const PAYMENT_MEDIUM_BN: Record<string, string> = {
  NPSB: 'এনপিএসবি',
  EFT: 'ইএফটি',
  MOBILE_BANKING: 'মোবাইল ব্যাংকিং',
  CASH_DEPOSIT: 'ক্যাশ ডিপোজিট',
}

export const PROVIDER_BN: Record<string, string> = {
  BKASH: 'বিকাশ',
  NAGAD: 'নগদ',
}

export const INCOME_CATEGORY_BN: Record<string, string> = {
  MONTHLY_DUE: 'মাসিক চাঁদা',
  FINE: 'জরিমানা',
  OTHER_INCOME: 'অন্যান্য আয়',
}
