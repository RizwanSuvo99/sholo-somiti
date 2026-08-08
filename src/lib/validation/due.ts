import { z } from 'zod'
import { monthSchema, takaToPaisaSchema, yearSchema } from './common'

export const dueSettingSchema = z.object({
  month: monthSchema,
  year: yearSchema,
  amount: takaToPaisaSchema,
  note: z.string().trim().max(300).optional(),
})

export const generateDuesSchema = z.object({
  month: monthSchema,
  year: yearSchema,
})

export type DueSettingBody = z.infer<typeof dueSettingSchema>
export type GenerateDuesBody = z.infer<typeof generateDuesSchema>
