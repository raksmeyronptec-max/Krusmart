'use client'

import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { setActiveAcademicYear } from '../actions'

/** Marks one year current. Exactly one per school holds `is_active`. */
export default function ActivateYearButton({ yearId }: { yearId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      onClick={() => startTransition(() => { setActiveAcademicYear(yearId) })}
      disabled={pending}
      className="flex items-center gap-1.5 rounded-full border border-divider px-3 py-1 text-xs font-bold text-text-body transition hover:border-brand hover:text-brand-hover disabled:opacity-50"
    >
      {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      កំណត់ជាបច្ចុប្បន្ន
    </button>
  )
}
