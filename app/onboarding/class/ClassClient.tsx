'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import Select from '@/components/ui/forms/Select'
import { StepHeading } from '@/components/onboarding/StepHeading'
import { notify } from '@/components/ui/feedback/notify'
import { CLASS_SECTIONS, classDisplayName, generatedClassName } from '@/lib/onboarding/curriculum'
import {
  CLASS_TRACKS, gradeNeedsTrack, levelByName, type ClassTrackKey,
} from '@/lib/onboarding/curriculum'
import { createClassAndAssign } from '../actions'

interface GradeOption {
  id: string
  name: string
  sortOrder: number
  levelName: string
}

export function ClassClient({
  grades,
  years,
  initialGradeId,
  initialYearId,
}: {
  grades: GradeOption[]
  years: { id: string; name: string }[]
  initialGradeId: string
  initialYearId: string
}) {
  const [gradeId, setGradeId] = useState(initialGradeId)
  const [track, setTrack] = useState<ClassTrackKey | ''>('')
  const [section, setSection] = useState<string>(CLASS_SECTIONS[0])
  const [yearId, setYearId] = useState(initialYearId)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const grade = useMemo(() => grades.find((g) => g.id === gradeId), [grades, gradeId])

  // ថ្នាក់ទី១១–១២ stream into ក្រុមវិទ្យាសាស្ត្រ / សង្គម — the same subject
  // carries a different full mark per stream, so the class must declare one.
  // Whether this grade streams is curriculum data (tracksFromGrade), not a
  // grade-number test written here.
  const needsTrack = grade
    ? gradeNeedsTrack(levelByName(grade.levelName), grade.sortOrder)
    : false

  /**
   * §10: "Do not force the teacher to manually type the generated class name."
   * It is derived on every render from the grade and section above it, so the
   * two cannot drift apart — there is no third field holding a stale copy.
   */
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
      })
      if (result?.error) {
        setError(result.error)
        notify.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <StepHeading title="បង្កើតថ្នាក់" question="សូមបញ្ជាក់ព័ត៌មានថ្នាក់របស់អ្នក" />

      <div className="flex flex-col gap-4">
        <Select
          label="កម្រិត និងថ្នាក់"
          value={gradeId}
          onChange={setGradeId}
          options={grades.map((g) => ({
            value: g.id,
            label: g.name,
            group: g.levelName,
          }))}
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
      </div>

      {/* The generated name, shown as an outcome rather than an editable field. */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-divider bg-paper px-4 py-3">
        <span className="text-xs font-bold text-text-muted">ឈ្មោះថ្នាក់</span>
        <span className="kh-moul text-base text-brand">{display || '—'}</span>
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/onboarding/level"
          className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-3 text-sm font-bold text-text-muted transition-colors hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          ត្រឡប់ក្រោយ
        </Link>

        <Button
          type="submit"
          size="lg"
          loading={pending}
          disabled={!gradeId || !yearId || !name || (needsTrack && !track)}
          className="sm:min-w-40"
        >
          បង្កើតថ្នាក់
        </Button>
      </div>
    </form>
  )
}
