'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LifeBuoy } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import { notify } from '@/components/ui/feedback/notify'
import { useActiveClass } from '@/lib/hooks/useActiveClass'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { recoverLegacyRoster } from './actions'

/**
 * Shown when the server detected the stranded-onboarding signature: the active
 * class has zero enrolments while students still exist under this teacher's
 * `teacher_id` (the state commit 2686507 left teachers in — see 00018).
 *
 * A visible, teacher-triggered action rather than a silent write on page load:
 * enrolling students into a class is a data change to student records, and the
 * teacher should see it happen — and see it audited — not wonder why the
 * roster changed by itself.
 */
export function RecoverRosterBanner({ count }: { count: number }) {
  const router = useRouter()
  const { classId } = useActiveClass()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const recover = async () => {
    setBusy(true)
    try {
      const result = await recoverLegacyRoster(classId ?? undefined)
      if (result.error) {
        notify.error(result.error)
        return
      }
      setDone(true)
      notify.success(
        `បាននាំសិស្ស ${toKhmerNumber(result.enrolled ?? 0)} នាក់ចូលក្នុងថ្នាក់នេះវិញដោយជោគជ័យ។`,
      )
      // The roster is fetched by the server component; re-render it.
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (done) return null

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-divider bg-bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <LifeBuoy className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold text-text-heading">
            សិស្សរបស់អ្នកមិនបានបាត់ទេ
          </p>
          <p className="text-sm text-text-body">
            អ្នកមានសិស្ស {toKhmerNumber(count)} នាក់ដែលបានបញ្ចូលពីមុន
            ប៉ុន្តែពួកគេមិនទាន់ត្រូវបានភ្ជាប់ចូលថ្នាក់ថ្មីរបស់អ្នកទេ។
            ចុចប៊ូតុងនេះ ដើម្បីនាំសិស្សទាំងអស់ចូលក្នុងថ្នាក់នេះវិញ។
          </p>
        </div>
      </div>
      <Button onClick={recover} loading={busy} className="shrink-0">
        នាំសិស្សចូលថ្នាក់វិញ
      </Button>
    </div>
  )
}
