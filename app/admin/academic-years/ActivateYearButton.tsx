'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/actions/Button'
import { Loader2 } from 'lucide-react'
import { setActiveAcademicYear } from '../actions'

/** Marks one year current. Exactly one per school holds `is_active`. */
export default function ActivateYearButton({ yearId }: { yearId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button variant="secondary" size="sm" printHidden={false} onClick={() => startTransition(() => { setActiveAcademicYear(yearId) })}
      disabled={pending}>
      {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      កំណត់ជាបច្ចុប្បន្ន
    </Button>
  )
}
