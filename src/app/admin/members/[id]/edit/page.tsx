import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { MemberForm } from '@/components/forms/member-form'
import { dbDateToCivil, formatCivilDate } from '@/lib/due-cycle'

export const dynamic = 'force-dynamic'

export default async function EditMemberPage({ params }: PageProps<'/admin/members/[id]/edit'>) {
  const { id } = await params
  const member = await prisma.member.findUnique({ where: { id } })
  if (!member) notFound()

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">সদস্য সম্পাদনা</h1>
      <Card>
        <CardHeader title={member.memberCode} />
        <CardBody>
          <MemberForm
            initial={{
              id: member.id,
              name: member.name,
              fatherName: member.fatherName ?? '',
              mobile: member.mobile ?? '',
              email: member.email ?? '',
              joinedOn: formatCivilDate(dbDateToCivil(member.joinedOn)),
              photoUrl: member.photoUrl,
              photoPublicId: member.photoPublicId,
            }}
          />
        </CardBody>
      </Card>
    </div>
  )
}
