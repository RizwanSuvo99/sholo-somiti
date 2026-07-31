import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('সঠিক ইমেইল দিন'),
  password: z.string().min(1, 'পাসওয়ার্ড দিন'),
})

export type LoginInput = z.infer<typeof loginSchema>
