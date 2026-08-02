'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function LogoutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        await fetch('/api/auth/logout', { method: 'POST' })
        router.replace('/login')
        router.refresh()
      }}
    >
      বেরিয়ে যান
    </Button>
  )
}
