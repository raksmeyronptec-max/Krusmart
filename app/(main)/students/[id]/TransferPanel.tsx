'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft } from 'lucide-react'

import { Button } from '@/components/ui/actions/Button'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { notify } from '@/components/ui/feedback/notify'
import { getErrorMessageOr } from '@/lib/utils/errors'
import { transferStudentToMyClass, type TransferTarget } from './actions'

/**
 * Moving this pupil to another of the teacher's classes.
 *
 * Rendered beneath the enrolment history on purpose: the history is what a
 * transfer appends to, and seeing "៥ក · ២០២៦-២០២៧ · បច្ចុប្បន្ន" directly above
 * the control is what makes it obvious that the old placement is kept rather
 * than overwritten.
 *
 * The server decides everything that matters. `targets` is already narrowed to
 * classes the teacher is form master of, with the pupil's current class
 * removed — and `transferStudentToMyClass` re-checks both ends anyway, because
 * a list is a convenience and never an authority.
 */
export function TransferPanel({
  studentId,
  studentName,
  targets,
}: {
  studentId: string
  studentName: string
  targets: TransferTarget[]
}) {
  const router = useRouter()
  const [targetId, setTargetId] = useState('')
  const [pending, startTransition] = useTransition()
  const { confirm, dialog } = useConfirm()

  // Nothing to offer: a teacher with one homeroom class, or none at all. An
  // empty picker beside a button would be a control that cannot be used.
  if (targets.length === 0) return null

  const target = targets.find((t) => t.classId === targetId)

  const run = async () => {
    if (!target) return
    const ok = await confirm({
      title: 'ផ្ទេរសិស្សទៅថ្នាក់ផ្សេង',
      tone: 'warning',
      confirmLabel: 'បញ្ជាក់ការផ្ទេរ',
      cancelLabel: 'បោះបង់',
      message: (
        <>
          ផ្ទេរ <span className="font-extrabold text-text-heading">{studentName}</span> ទៅ{' '}
          <span className="font-extrabold text-text-heading">{target.className}</span>?
          <br />
          ការចុះឈ្មោះចាស់នឹងត្រូវរក្សាទុកជាប្រវត្តិ — ពិន្ទុ និងវត្តមានចាស់មិនបាត់ទេ។
        </>
      ),
    })
    if (!ok) return

    startTransition(async () => {
      try {
        const res = await transferStudentToMyClass(studentId, target.classId)
        if (res.error) {
          notify.error(res.error)
          return
        }
        notify.success(`បានផ្ទេរ ${studentName} ទៅ ${target.className}`)
        setTargetId('')
        // The page is a server component; its enrolment history and every
        // class-scoped figure on it are now stale.
        router.refresh()
      } catch (error) {
        notify.error(getErrorMessageOr(error, 'ផ្ទេរមិនបានសម្រេច'))
      }
    })
  }

  return (
    <div className="mt-3 border-t border-divider pt-3 print:hidden">
      <p className="mb-2 text-xs text-text-muted">
        ផ្ទេរសិស្សទៅថ្នាក់ផ្សេងរបស់អ្នក។ ការចុះឈ្មោះចាស់ត្រូវរក្សាទុកជាប្រវត្តិ។
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SearchableSelect
          ariaLabel="ថ្នាក់គោលដៅ"
          placeholder="-- ជ្រើសរើសថ្នាក់ --"
          searchPlaceholder="ស្វែងរកថ្នាក់..."
          emptyMessage="រកមិនឃើញថ្នាក់"
          value={targetId}
          onChange={setTargetId}
          wrapperClassName="min-w-[220px] flex-1"
          options={targets.map((t) => ({
            value: t.classId,
            label: t.className,
            group: t.academicYearName,
          }))}
        />
        <Button
          variant="secondary"
          printHidden={false}
          disabled={!target || pending}
          loading={pending}
          onClick={run}
          icon={<ArrowRightLeft className="h-4 w-4" aria-hidden="true" />}
        >
          ផ្ទេរ
        </Button>
      </div>
      {dialog}
    </div>
  )
}

export default TransferPanel
