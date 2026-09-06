'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive } from 'lucide-react'

import { Dialog } from '@/components/ui/overlay/Dialog'
import { Button } from '@/components/ui/actions/Button'
import Select from '@/components/ui/forms/Select'
import { notify } from '@/components/ui/feedback/notify'
import { useTeacherContext } from '@/lib/context/TeacherContext'
import { CLASS_SECTIONS, classDisplayName } from '@/lib/onboarding/curriculum'
import type { ClassroomClass } from '@/lib/classroom/classes'
import { archiveClass, renameClass } from './actions'

/**
 * កែថ្នាក់ — rename by section, or archive.
 *
 * ── Why the only editable field is a letter ────────────────────────────────
 *
 * `classes.name` is `generatedClassName(gradeNumber, section)` — `៥ក`. The
 * grade half is derived so the name and the grade cannot drift apart, and the
 * grade is what resolves the score template. A free-text box would let a
 * grade-5 class be named `៧ខ` and quietly change nothing about which
 * curriculum it actually resolves, which is the worst of both. So the section
 * is offered and the name is regenerated server-side from the class's own row.
 *
 * The academic year is absent for a blunter reason: moving a class between
 * years would re-point every mark already recorded against it.
 *
 * ── Archiving ─────────────────────────────────────────────────────────────
 *
 * Not a delete, and it does not pretend to be reversible-by-the-teacher either.
 * It flips their assignments away from `'active'`, which is what every scoped
 * read filters on, so the class stops being listed while its marks stay put.
 * The server refuses outright when it is the teacher's last active class — see
 * `archiveClass` — so this dialog does not have to describe a consequence it
 * cannot undo.
 */
export function ManageClassDialog({
  cls,
  open,
  onClose,
}: {
  cls: ClassroomClass | null
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const teacher = useTeacherContext()

  // The section is the last character of `៥ក`. Derived rather than stored: the
  // name is the source of truth and this dialog is opened fresh each time.
  const current = cls?.className.slice(-1) ?? CLASS_SECTIONS[0]
  const [section, setSection] = useState<string>(current)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Re-seed when a different card opens the dialog.
  const [seenId, setSeenId] = useState(cls?.classId ?? '')
  if (cls && cls.classId !== seenId) {
    setSeenId(cls.classId)
    setSection(current)
    setConfirming(false)
    setError(null)
  }

  if (!cls) return null

  const renamed = section !== current
  const preview = cls.gradeNumber !== null ? classDisplayName(cls.gradeNumber, section) : section

  function run(work: () => Promise<{ error?: string; success?: true }>, done: string) {
    setError(null)
    startTransition(async () => {
      const result = await work()
      if (result?.error) {
        setError(result.error)
        notify.error(result.error)
        return
      }
      await teacher?.refresh()
      router.refresh()
      notify.success(done)
      onClose()
    })
  }

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title="កែថ្នាក់"
      description={cls.className}
      dismissible={!pending}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            បិទ
          </Button>
          <Button
            onClick={() => run(() => renameClass({ classId: cls.classId, section }), 'បានប្តូរឈ្មោះថ្នាក់')}
            loading={pending}
            disabled={!renamed}
          >
            រក្សាទុក
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label="ផ្នែក"
          value={section}
          onChange={setSection}
          options={CLASS_SECTIONS.map((s) => ({ value: s, label: s }))}
        />

        <div className="flex items-center justify-between gap-4 rounded-xl border border-divider bg-paper px-4 py-3">
          <span className="text-xs font-bold text-text-muted">ឈ្មោះថ្នាក់</span>
          <span className="kh-moul text-base text-brand">{preview}</span>
        </div>

        <p className="text-xs leading-relaxed text-text-muted">
          កម្រិតថ្នាក់ និងឆ្នាំសិក្សាមិនអាចកែបានទេ ព្រោះវាកំណត់មុខវិជ្ជា និងពិន្ទុដែលបានបញ្ចូលរួច។
        </p>

        {/* ---------------------------------------------------------- archive */}
        <div className="mt-1 border-t border-divider pt-4">
          {confirming ? (
            <div className="flex flex-col gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="text-xs leading-relaxed font-medium text-text-body">
                ថ្នាក់នេះនឹងលែងបង្ហាញក្នុងបញ្ជីរបស់អ្នក។ <strong>ពិន្ទុ វត្តមាន និងសិស្សមិនត្រូវបានលុបទេ</strong> —
                នាយកសាលានៅតែអាចមើលឃើញ។
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  loading={pending}
                  onClick={() =>
                    run(() => archiveClass({ classId: cls.classId }), 'បានទុកថ្នាក់ក្នុងប័ណ្ណសារ')
                  }
                >
                  បញ្ជាក់ការទុកក្នុងប័ណ្ណសារ
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
                  បោះបង់
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              icon={<Archive className="h-4 w-4" />}
              onClick={() => setConfirming(true)}
              disabled={pending}
            >
              ទុកថ្នាក់ក្នុងប័ណ្ណសារ
            </Button>
          )}
        </div>

        {error && (
          <p role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
