import { z } from 'zod'
import { parseCivilDate, type CivilDate } from '@/lib/due-cycle'
import { toPaisa } from '@/lib/money'
import { normalizeMemberCode } from '@/lib/member-code'

/** `YYYY-MM-DD`, validated as a real calendar day and carried as a CivilDate. */
export const civilDateSchema = z
  .string()
  .trim()
  .transform((value, ctx): CivilDate => {
    try {
      return parseCivilDate(value)
    } catch {
      ctx.addIssue({ code: 'custom', message: 'সঠিক তারিখ দিন (YYYY-MM-DD)' })
      return z.NEVER
    }
  })

/**
 * A taka amount as typed, converted to paisa at this single point. Accepts
 * Bengali digits, thousands separators and a ৳ sign.
 */
export const takaToPaisaSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx): number => {
    try {
      return toPaisa(value)
    } catch {
      ctx.addIssue({ code: 'custom', message: 'সঠিক পরিমাণ দিন' })
      return z.NEVER
    }
  })
  .refine((paisa) => paisa > 0, { message: 'পরিমাণ শূন্যের বেশি হতে হবে' })

export const memberCodeSchema = z
  .string()
  .trim()
  .min(1, 'আইডি নম্বর দিন')
  .transform((value) => normalizeMemberCode(value))

export const monthSchema = z.coerce.number().int().min(1, 'মাস ১–১২').max(12, 'মাস ১–১২')
export const yearSchema = z.coerce.number().int().min(2000).max(2100)

export const uuidSchema = z.string().uuid('সঠিক আইডি নয়')

export const requiredNote = z.string().trim().min(1, 'বিবরণ লিখুন').max(500)

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
