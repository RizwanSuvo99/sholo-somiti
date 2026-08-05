import { z } from 'zod'
import { civilDateSchema } from './common'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()

export const createMemberSchema = z.object({
  name: z.string().trim().min(1, 'নাম লিখুন').max(120),
  fatherName: optionalText(120),
  mobile: optionalText(20),
  email: z
    .union([z.string().trim().email('সঠিক ইমেইল দিন'), z.literal('')])
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
  photoUrl: optionalText(500),
  photoPublicId: optionalText(200),
  joinedOn: civilDateSchema,
})

export const updateMemberSchema = createMemberSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export type CreateMemberBody = z.infer<typeof createMemberSchema>
export type UpdateMemberBody = z.infer<typeof updateMemberSchema>
