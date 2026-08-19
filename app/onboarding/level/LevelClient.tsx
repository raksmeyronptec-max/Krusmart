'use client'

import { useEffect, useState, useTransition } from 'react'
import { GraduationCap, BookOpen, Library } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import { ChoiceCard } from '@/components/onboarding/ChoiceCard'
import { StepHeading } from '@/components/onboarding/StepHeading'
import { notify } from '@/components/ui/feedback/notify'
import {
  EDUCATION_LEVELS, gradeRangeLabel, levelIsSelectable, type EducationLevelKey,
} from '@/lib/onboarding/curriculum'
import { clearPendingLevel, readPendingLevel } from '@/lib/onboarding/pendingLevel'
import { chooseEducationLevel } from '../actions'

const ICONS = {
  primary: GraduationCap,
  lower_secondary: BookOpen,
  upper_secondary: Library,
} as const

export function LevelClient() {
  const [key, setKey] = useState<EducationLevelKey>('primary')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Restore the level picked on /choose-level before sign-in. One-shot and a
  // hint only — the teacher still confirms, and the server action re-validates
  // the key regardless. Deferred a tick so the state update runs after
  // hydration (sessionStorage does not exist on the server), the same pattern
  // ProfileClient uses for its draft.
  useEffect(() => {
    const t = setTimeout(() => {
      const pendingLevel = readPendingLevel()
      if (pendingLevel) {
        setKey(pendingLevel)
        clearPendingLevel()
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await chooseEducationLevel(key)
      if (result?.error) {
        setError(result.error)
        notify.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <StepHeading
        title="ជ្រើសរើសកម្រិតសិក្សា"
        question="តើអ្នកបង្រៀននៅកម្រិតសិក្សាណា?"
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">កម្រិតសិក្សា</legend>
        {EDUCATION_LEVELS.map((level) => {
          const Icon = ICONS[level.key]
          // Same gate as /choose-level: a level with no seeded curriculum is
          // not offered, so nobody enters a term against a scale the screen
          // did not promise.
          const selectable = levelIsSelectable(level)
          return (
            <ChoiceCard
              key={level.key}
              name="level"
              value={level.key}
              checked={key === level.key}
              disabled={!selectable}
              onChange={(v) => setKey(v as EducationLevelKey)}
              icon={<Icon className="h-5 w-5" />}
              title={level.name}
              description={selectable ? level.description : `${level.description} · មិនទាន់មានកម្មវិធីសិក្សា`}
              meta={level.seededNote ?? gradeRangeLabel(level)}
            />
          )
        })}
      </fieldset>

      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" loading={pending}>
        បន្ត
      </Button>
    </form>
  )
}
