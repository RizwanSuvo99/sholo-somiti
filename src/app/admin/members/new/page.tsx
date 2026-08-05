import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { MemberForm } from '@/components/forms/member-form'

export const metadata = { title: 'নতুন সদস্য — ষোলো সমবায় সমিতি' }

export default function NewMemberPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">নতুন সদস্য</h1>
      <Card>
        <CardHeader title="সদস্যের তথ্য" />
        <CardBody>
          <MemberForm />
        </CardBody>
      </Card>
      <p className="text-sm text-muted">
        আইডি নম্বর (যেমন NHSS-26029) স্বয়ংক্রিয়ভাবে তৈরি হবে।
      </p>
    </div>
  )
}
