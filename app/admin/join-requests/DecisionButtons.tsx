'use client'

import { useTransition } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
import { notify } from '@/components/ui/feedback/notify'
import { approveJoinRequest, rejectJoinRequest } from '../actions'

/**
 * Approve / reject one request. A client island because the actions return
 * `ActionResult` and a refused decision must say *why* (already decided, not
 * this school's admin, …) — a bare `<form action>` would swallow the message.
 */
export function DecisionButtons({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition()

  function decide(action: typeof approveJoinRequest, done: string) {
    startTransition(async () => {
      const data = new FormData()
      data.set('request_id', requestId)
      const result = await action(data)
      if (result?.error) notify.error(result.error)
      else notify.success(done)
    })
  }

  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => decide(approveJoinRequest, 'បានអនុម័ត — កុំភ្លេចចាត់តាំងថ្នាក់ជូនគ្រូ')}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-success px-4 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
        អនុម័ត
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => decide(rejectJoinRequest, 'បានបដិសេធសំណើ')}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-4 text-sm font-bold text-danger transition hover:border-danger disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <X className="h-4 w-4" aria-hidden="true" /> បដិសេធ
      </button>
    </div>
  )
}
