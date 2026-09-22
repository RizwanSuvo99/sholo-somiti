import 'server-only'
import { prisma } from '@/lib/prisma'
import { formatMemberCode } from '@/lib/member-code'
import { civilToDbDate, dbDateToCivil, type CivilDate } from '@/lib/due-cycle'
import { isUniqueViolation } from '@/lib/api/errors'
import { MEMBER_DEPOSIT_CATEGORIES } from '@/lib/settlement'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Take the next member-code sequence number.
 *
 * `UPDATE ... RETURNING` on a single counter row takes a row lock, so concurrent
 * creates serialise here. Crucially the increment is inside the caller's
 * transaction: if the member insert fails, the number is given back, keeping the
 * sequence continuous as the specification requires. A Postgres SEQUENCE would
 * be faster but `nextval()` is non-transactional and would leave gaps.
 */
async function nextMemberSequence(tx: Tx): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    UPDATE counters SET value = value + 1 WHERE key = 'member_code' RETURNING value
  `
  if (rows.length === 0) {
    throw new Error("counters row 'member_code' is missing — run migrations")
  }
  return rows[0].value
}

export type CreateMemberInput = {
  name: string
  fatherName?: string | null
  mobile?: string | null
  email?: string | null
  photoUrl?: string | null
  photoPublicId?: string | null
  joinedOn: CivilDate
}

export async function createMember(input: CreateMemberInput) {
  // The unique constraint on member_code is the final backstop. A retry covers
  // the vanishingly rare case where a code was inserted by some other path.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const sequence = await nextMemberSequence(tx)
        return tx.member.create({
          data: {
            memberCode: formatMemberCode(input.joinedOn.y, sequence),
            name: input.name,
            fatherName: input.fatherName ?? null,
            mobile: input.mobile ?? null,
            email: input.email ?? null,
            photoUrl: input.photoUrl ?? null,
            photoPublicId: input.photoPublicId ?? null,
            joinedOn: civilToDbDate(input.joinedOn),
          },
        })
      })
    } catch (error) {
      if (attempt === 2 || !isUniqueViolation(error)) throw error
    }
  }
  throw new Error('could not allocate a member code')
}

export type UpdateMemberInput = Partial<Omit<CreateMemberInput, 'joinedOn'>> & {
  joinedOn?: CivilDate
  isActive?: boolean
}

export async function updateMember(id: string, input: UpdateMemberInput) {
  const deactivating = input.isActive === false

  return prisma.member.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.fatherName !== undefined ? { fatherName: input.fatherName } : {}),
      ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
      ...(input.photoPublicId !== undefined ? { photoPublicId: input.photoPublicId } : {}),
      ...(input.joinedOn !== undefined ? { joinedOn: civilToDbDate(input.joinedOn) } : {}),
      ...(input.isActive !== undefined
        ? {
            isActive: input.isActive,
            // Members are never deleted; the date records when they left so
            // historical dues and fines stay attributable.
            deactivatedOn: deactivating ? new Date() : null,
          }
        : {}),
    },
  })
}

/** A member's full month-by-month history, plus the running total contributed. */
export async function getMemberHistory(memberId: string) {
  const [member, duePayments, contributions] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId } }),
    prisma.duePayment.findMany({
      where: { memberId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { sourceSubmission: { select: { id: true, transactionRef: true } } },
    }),
    prisma.transaction.aggregate({
      where: {
        memberId,
        type: 'INCOME',
        incomeCategory: { in: MEMBER_DEPOSIT_CATEGORIES },
        voidedAt: null,
      },
      _sum: { amountPaisa: true },
    }),
  ])

  if (!member) return null

  return {
    member: { ...member, joinedOnCivil: dbDateToCivil(member.joinedOn) },
    duePayments,
    totalContributedPaisa: contributions._sum.amountPaisa ?? 0,
  }
}
