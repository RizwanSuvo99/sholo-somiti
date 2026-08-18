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

export type FineImportBody = z.infer<typeof fineImportSchema>
export type UniformImportBody = z.infer<typeof uniformImportSchema>
