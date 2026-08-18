'use client'

import { useState, useTransition } from 'react'
import { GraduationCap, BookOpen, Library } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import { ChoiceCard } from '@/components/onboarding/ChoiceCard'
import { StepHeading } from '@/components/onboarding/StepHeading'
import { notify } from '@/components/ui/feedback/notify'
import { EDUCATION_LEVELS, gradeRangeLabel, type EducationLevelKey } from '@/lib/onboarding/curriculum'
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
          return (
            <ChoiceCard
              key={level.key}
              name="level"
              value={level.key}
              checked={key === level.key}
              onChange={(v) => setKey(v as EducationLevelKey)}
              icon={<Icon className="h-5 w-5" />}
              title={level.name}
              description={level.description}
              meta={gradeRangeLabel(level)}
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
