'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Deactivation is a soft delete — historical dues, fines and ledger entries stay
 * attached to the member, so past accounts still reconcile.
 */
export function DeactivateButton({ memberId, isActive }: { memberId: string; isActive: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function toggle() {
    setPending(true)
    try {
      await fetch(`/api/admin/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      })
      router.refresh()
    } finally {
      setPending(false)
      setConfirming(false)
    }
  }

  if (!isActive) {
    return (
      <Button size="sm" variant="secondary" disabled={pending} onClick={toggle}>
        আবার সক্রিয় করুন
      </Button>
    )
  }

  if (!confirming) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
        নিষ্ক্রিয় করুন
      </Button>
    )
  }

  return (
    <span className="flex items-center gap-2">
      <span className="text-xs text-muted">নিশ্চিত?</span>
      <Button size="sm" variant="danger" disabled={pending} onClick={toggle}>
        হ্যাঁ
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
        না
      </Button>
    </span>
  )
}
