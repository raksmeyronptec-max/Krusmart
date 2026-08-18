'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import { ChoiceCard } from '@/components/onboarding/ChoiceCard'
import { StepHeading } from '@/components/onboarding/StepHeading'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { notify } from '@/components/ui/feedback/notify'
import { chooseGrade } from '../actions'

interface GradeRow {
  id: string
  name: string
  sort_order: number
}

export function GradeClient({
  levelName,
  grades,
}: {
  levelName: string
  grades: GradeRow[]
}) {
  const [gradeId, setGradeId] = useState(grades[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await chooseGrade(gradeId)
      if (result?.error) {
        setError(result.error)
        notify.error(result.error)
      }
    })
  }

  if (grades.length === 0) {
    return (
      <EmptyState
        title="មិនទាន់មានថ្នាក់"
        description="សូមត្រឡប់ក្រោយ ហើយជ្រើសរើសកម្រិតសិក្សាម្តងទៀត"
        action={
          <Link href="/onboarding/level">
            <Button variant="secondary">ត្រឡប់ក្រោយ</Button>
          </Link>
        }
      />
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <StepHeading title="ជ្រើសរើសថ្នាក់" question={`តើអ្នកបង្រៀនថ្នាក់ណានៅ${levelName}?`} />

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="sr-only">ថ្នាក់</legend>
        {grades.map((g) => (
          <ChoiceCard
            key={g.id}
            name="grade"
            value={g.id}
            checked={gradeId === g.id}
            onChange={setGradeId}
            title={g.name}
          />
        ))}
      </fieldset>

      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* §29 — back navigation must not lose what was already entered. The
            level rows are persisted, so stepping back re-reads them. */}
        <Link
          href="/onboarding/level"
          className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-3 text-sm font-bold text-text-muted transition-colors hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          ត្រឡប់ក្រោយ
        </Link>

        <Button type="submit" size="lg" loading={pending} disabled={!gradeId} className="sm:min-w-40">
          បន្ត
        </Button>
      </div>
    </form>
  )
}
