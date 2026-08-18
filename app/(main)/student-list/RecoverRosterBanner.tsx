'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LifeBuoy } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import { notify } from '@/components/ui/feedback/notify'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { recoverLegacyRoster } from './actions'

/**
 * Shown when the server found students under this teacher's `teacher_id` with
 * no enrolment row anywhere — the state commit 2686507 left onboarded teachers
 * in (see migration 00018), and the state a failed enrol-compensation in
 * `enrollment/actions.ts` falls back to.
 *
 * A visible, teacher-triggered action rather than a silent write on page load:
 * enrolling students into a class is a data change to student records, and the
 * teacher should see it happen — and see it audited — not wonder why the
 * roster changed by itself.
 *
 * `classId` comes from the server page's validated scope, not from client
 * context: the banner's precondition was computed for that exact class, and
 * recovering into whatever class the (possibly still-loading) context points
 * at could file the roster somewhere the teacher is not looking.
 */
export function RecoverRosterBanner({ count, classId }: { count: number; classId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const recover = async () => {
    setBusy(true)
    try {
      const result = await recoverLegacyRoster(classId)
      if (result.error) {
        notify.error(result.error)
        return
      }
      const enrolled = result.enrolled ?? 0
      if (enrolled > 0) {
        notify.success(
          `បាននាំសិស្ស ${toKhmerNumber(enrolled)} នាក់ចូលក្នុងថ្នាក់នេះវិញដោយជោគជ័យ។`,
        )
      } else {
        // A no-op is not a success story — say so instead of celebrating ០.
        notify.error('មិនមានសិស្សដែលអាចនាំចូលថ្នាក់នេះបានទេ។')
      }
      // The roster is fetched by the server component; refreshing re-runs the
      // page's detection and unmounts this banner via the key change. No local
      // "done" flag on purpose: whether the banner should still show is the
      // server's call — if recovery legitimately enrolled nobody, it stays.
      router.refresh()
    } catch {
      // A thrown action (network drop, expired session, redeploy) rejects
      // instead of returning {error} — without this the button silently
      // does nothing and the rejection goes unhandled.
      notify.error('មិនអាចនាំសិស្សចូលថ្នាក់វិញបានទេ។ សូមព្យាយាមម្តងទៀត។')
    } finally {
      setBusy(false)
    }
  }

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
            អ្នកមានសិស្ស {toKhmerNumber(count)} នាក់ដែលមិនទាន់បានភ្ជាប់ចូលថ្នាក់ណាមួយ។
            ចុចប៊ូតុងនេះ ដើម្បីនាំសិស្សទាំងនោះចូលក្នុងថ្នាក់នេះ។
          </p>
        </div>
      </div>
      <Button onClick={recover} loading={busy} className="shrink-0">
        នាំសិស្សចូលថ្នាក់វិញ
      </Button>
    </div>
  )
}
