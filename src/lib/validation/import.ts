import { z } from 'zod'
import { memberCodeSchema, monthSchema, takaToPaisaSchema, yearSchema } from './common'

export const fineImportSchema = z.object({
  memberCode: memberCodeSchema,
  month: monthSchema,
  year: yearSchema,
  amount: takaToPaisaSchema,
  note: z.string().trim().max(300).optional(),
})

export const uniformImportSchema = z.object({
  month: monthSchema,
  year: yearSchema,
  amount: takaToPaisaSchema,
  note: z.string().trim().max(300).optional(),
})

export const memberBackfillSchema = z.object({
  memberCode: memberCodeSchema,
  fromMonth: monthSchema,
  fromYear: yearSchema,
  toMonth: monthSchema,
  toYear: yearSchema,
  /**
   * Move the joining date back to cover the range. On by default, because a
   * profile reading "member since October 2026" above a year of earlier
   * payments is the first thing anyone would query.
   */
  alignJoinedOn: z.boolean().default(true),
  note: z.string().trim().max(300).optional(),
})

export type FineImportBody = z.infer<typeof fineImportSchema>
export type MemberBackfillBody = z.infer<typeof memberBackfillSchema>
export type UniformImportBody = z.infer<typeof uniformImportSchema>
