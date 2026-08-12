import { z } from 'zod'
import { civilDateSchema, memberCodeSchema, monthSchema, takaToPaisaSchema, yearSchema } from './common'

export const createSubmissionSchema = z
  .object({
    memberCode: memberCodeSchema,
    name: z.string().trim().min(1, 'নাম লিখুন').max(120),
    sendingDate: civilDateSchema,
    amount: takaToPaisaSchema,
    transactionRef: z.string().trim().min(1, 'ট্রানজেকশন আইডি দিন').max(100),
    paymentMedium: z.enum(['NPSB', 'EFT', 'MOBILE_BANKING', 'CASH_DEPOSIT']),
    bankName: z.string().trim().max(120).optional().nullable(),
    mobileBankingProvider: z.enum(['BKASH', 'NAGAD']).optional().nullable(),
    mobileBankingNumber: z.string().trim().max(20).optional().nullable(),
    screenshotUrl: z.string().url('ছবি আপলোড করুন'),
    screenshotPublicId: z.string().trim().max(200).optional().nullable(),
    dueMonth: monthSchema.optional(),
    dueYear: yearSchema.optional(),
  })
  // The conditional fields the form shows. A database CHECK enforces the same
  // shape, because this endpoint is public and the form is not the only caller.
  .superRefine((value, ctx) => {
    if (value.paymentMedium === 'MOBILE_BANKING') {
      if (!value.mobileBankingProvider) {
        ctx.addIssue({ code: 'custom', path: ['mobileBankingProvider'], message: 'বিকাশ না নগদ বেছে নিন' })
      }
      if (!value.mobileBankingNumber) {
        ctx.addIssue({ code: 'custom', path: ['mobileBankingNumber'], message: 'যে নম্বর থেকে পাঠিয়েছেন তা দিন' })
      }
    } else if (!value.bankName) {
      ctx.addIssue({ code: 'custom', path: ['bankName'], message: 'ব্যাংকের নাম দিন' })
    }
  })

export const rejectSubmissionSchema = z.object({
  reason: z.string().trim().min(3, 'কারণ লিখুন').max(300),
})

export const approveSubmissionSchema = z.object({
  dueMonth: monthSchema.optional(),
  dueYear: yearSchema.optional(),
  note: z.string().trim().max(500).optional(),
})

export type CreateSubmissionBody = z.infer<typeof createSubmissionSchema>
export type RejectSubmissionBody = z.infer<typeof rejectSubmissionSchema>
export type ApproveSubmissionBody = z.infer<typeof approveSubmissionSchema>
