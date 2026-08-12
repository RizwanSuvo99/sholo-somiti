import Link from 'next/link'
import { Card, CardBody } from '@/components/ui/card'

export const metadata = { title: 'জমা হয়েছে — ষোলো সমবায় সমিতি' }

export default function SubmitSuccessPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <Card className="w-full">
        <CardBody className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-positive/10 text-2xl text-positive">
            ✓
          </div>
          <h1 className="text-xl font-bold">আপনার তথ্য জমা হয়েছে</h1>
          <p className="text-sm text-muted">
            প্রশাসক যাচাই করার পর এটি সমিতির হিসাবে যুক্ত হবে। যাচাই না হওয়া পর্যন্ত এটি
            পরিশোধিত হিসেবে গণ্য হবে না।
          </p>
          <Link href="/pay/submit" className="inline-block text-sm text-brand underline">
            আরেকটি তথ্য জমা দিন
          </Link>
        </CardBody>
      </Card>
    </main>
  )
}
