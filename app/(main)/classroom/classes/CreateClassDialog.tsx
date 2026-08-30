'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Dialog } from '@/components/ui/overlay/Dialog'
import { Button } from '@/components/ui/actions/Button'
import Select from '@/components/ui/forms/Select'
import { notify } from '@/components/ui/feedback/notify'
import { useTeacherContext } from '@/lib/context/TeacherContext'
import {
  CLASS_SECTIONS, CLASS_TRACKS, classDisplayName, generatedClassName,
  gradeNeedsTrack, levelByName, type ClassTrackKey,
} from '@/lib/onboarding/curriculum'
import { createClassAndAssign } from '@/app/onboarding/actions'

export interface GradeOption {
  id: string
  name: string
  sortOrder: number
  levelName: string
}

/**
 * បង្កើតថ្នាក់ថ្មី — the dialog that closes the product gap.
 *
 * ★ IT CALLS `createClassAndAssign`, THE ONBOARDING ACTION, UNCHANGED IN
 * SUBSTANCE. Not because sharing is tidy, but because that action does two
 * things no call site can see: it runs `backfill_teacher_enrolments()` the
 * moment the assignment flips the account to v2 scope, and it rolls the
 * assignment *and* the class back if that backfill fails. A second creation
 * path here would be a path that forgets both — leaving a teacher v2-scoped
 * with an empty roster, or with a half-created class whose name they can never
 * reuse. The only thing added for this caller is `origin`, which decides
 * whether the action redirects into the wizard or returns.
 *
 * The failure semantics are therefore *not* caught and softened: whatever the
 * action reports is what the teacher is shown, and nothing is closed or
 * refreshed until it reports success.
 *
 * ── Why the name is generated, not typed ───────────────────────────────────
 *
 * The class name comes from grade + section (`generatedClassName`), exactly as
 * `/onboarding/class` builds it, and is shown as an outcome rather than an
 * editable field. Two naming conventions for one table is how `៥ក` and
 * `Class 5A` end up in the same school, and `classes` carries
 * `UNIQUE (grade_id, academic_year_id, name)` — a free-typed duplicate is an
 * error the teacher cannot diagnose. Section is the field that varies, so
 * section is the field offered.
 */
export function CreateClassDialog({
  open,
  onClose,
  grades,
  years,
}: {
  open: boolean
  onClose: () => void
  grades: GradeOption[]
  years: { id: string; name: string }[]
}) {
  const router = useRouter()
  const teacher = useTeacherContext()

  const [gradeId, setGradeId] = useState(grades[0]?.id ?? '')
  const [section, setSection] = useState<string>(CLASS_SECTIONS[0])
  const [yearId, setYearId] = useState(years[0]?.id ?? '')
  const [track, setTrack] = useState<ClassTrackKey | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  /*
   * Ticked by default, and that default is load-bearing rather than polite.
   *
   * `student_enrollments_write_assigned_or_admin` (00003) permits an enrolment
   * write only to a class's homeroom teacher or a school admin. Unticking this
   * therefore builds a class the teacher cannot put a single student into
   * themselves — coherent for a subject teacher in a school whose admin fills
   * the roster, a dead end for a self-serve teacher who is their own admin.
   *
   * It stays offered because `/admin/teachers` already asks the same question
   * with the same checkbox, and two surfaces that disagree about whether
   * homeroom is a choice would be worse than one that explains it. What is not
   * acceptable is asking silently, so unticking says what it costs.
   */
  const [isHomeroom, setIsHomeroom] = useState(true)

  const grade = useMemo(() => grades.find((g) => g.id === gradeId), [grades, gradeId])

  // ថ្នាក់ទី១១–១២ stream into វិទ្យាសាស្ត្រ / សង្គម, and the same subject carries
  // a different full mark per stream. Whether this grade streams is curriculum
  // data, never a grade-number test written here.
  const needsTrack = grade ? gradeNeedsTrack(levelByName(grade.levelName), grade.sortOrder) : false

  const name = grade ? generatedClassName(grade.sortOrder, section) : ''
  const display = grade ? classDisplayName(grade.sortOrder, section) : ''

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await createClassAndAssign({
        gradeId,
        name,
        academicYearId: yearId,
        track: needsTrack && track ? track : undefined,
        origin: 'classroom',
        isHomeroom,
      })

      // Nothing optimistic: the dialog stays open and the list is untouched
      // until the server says the class exists.
      if (result?.error) {
        setError(result.error)
        notify.error(result.error)
        return
      }

      /*
       * Two refreshes, because two things hold stale data.
       *
       * `TeacherContext` loaded the teacher's assignments once, on mount, and
       * the one just written is not in it — without this the new class could
       * not be selected as active, and the top-bar switcher would not list it.
       * `router.refresh()` re-runs the server component so the card appears.
       */
      await teacher?.refresh()
      router.refresh()
      notify.success('បានបង្កើតថ្នាក់ថ្មី')
      onClose()
    })
  }

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title="បង្កើតថ្នាក់ថ្មី"
      description="ថ្នាក់ថ្មីនឹងត្រូវបានបន្ថែមទៅក្នុងបញ្ជីថ្នាក់របស់អ្នក"
      dismissible={!pending}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            បោះបង់
          </Button>
          <Button
            type="submit"
            form="create-class-form"
            loading={pending}
            disabled={!gradeId || !yearId || !name || (needsTrack && !track)}
          >
            បង្កើតថ្នាក់
          </Button>
        </div>
      }
    >
      <form id="create-class-form" onSubmit={submit} className="flex flex-col gap-4">
        <Select
          label="កម្រិត និងថ្នាក់"
          value={gradeId}
          onChange={setGradeId}
          options={grades.map((g) => ({ value: g.id, label: g.name, group: g.levelName }))}
        />

        <Select
          label="ផ្នែក"
          value={section}
          onChange={setSection}
          options={CLASS_SECTIONS.map((s) => ({ value: s, label: s }))}
        />

        <Select
          label="ឆ្នាំសិក្សា"
          value={yearId}
          onChange={setYearId}
          options={years.map((y) => ({ value: y.id, label: y.name }))}
        />

        {needsTrack && (
          <Select
            label="ក្រុមសិក្សា"
            value={track}
            onChange={(v) => setTrack(v as ClassTrackKey)}
            placeholder="ជ្រើសរើសក្រុម..."
            options={CLASS_TRACKS.map((t) => ({ value: t.key, label: t.label }))}
          />
        )}

        <div className="flex flex-col gap-2">
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={isHomeroom}
              onChange={(e) => setIsHomeroom(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-divider"
            />
            <span className="text-sm font-bold text-text-body">ខ្ញុំជាគ្រូបន្ទុកថ្នាក់នេះ</span>
          </label>

          {/* Stated here, not discovered later against an empty roster. */}
          {!isHomeroom && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed font-medium text-text-body">
              អ្នកនឹង<strong>មិនអាចបញ្ចូលសិស្សដោយខ្លួនឯង</strong>ទៅក្នុងថ្នាក់នេះបានទេ។
              មានតែគ្រូបន្ទុកថ្នាក់ ឬនាយកសាលាប៉ុណ្ណោះដែលអាចបញ្ចូលសិស្សបាន។
            </p>
          )}
        </div>

        {/* The generated name, as an outcome rather than a field. */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-divider bg-paper px-4 py-3">
          <span className="text-xs font-bold text-text-muted">ឈ្មោះថ្នាក់</span>
          <span className="kh-moul text-base text-brand">{display || '—'}</span>
        </div>

        {error && (
          <p role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}
