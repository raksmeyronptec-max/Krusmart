'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GraduationCap, BookOpen, Library, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import { ChoiceCard } from '@/components/onboarding/ChoiceCard'
import { EDUCATION_LEVELS, gradeRangeLabel, type EducationLevelKey } from '@/lib/onboarding/curriculum'
import { writePendingLevel } from '@/lib/onboarding/pendingLevel'
import { DEFAULT_SCHEME_CONFIG, SECONDARY_SCHEME_CONFIG } from '@/lib/grading/scheme'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

const ICONS = {
  primary: GraduationCap,
  lower_secondary: BookOpen,
  upper_secondary: Library,
} as const

/**
 * Which average scale each level's marks land on — shown on the card because
 * it is the concrete thing that differs between the levels a teacher is
 * choosing among. Read from the grading configs, never retyped: the number on
 * this card must be the number the engine divides by.
 */
function scaleLabel(key: EducationLevelKey): string {
  const max = key === 'primary' ? DEFAULT_SCHEME_CONFIG.maxScore : SECONDARY_SCHEME_CONFIG.maxScore
  return `ពិន្ទុមធ្យមភាគ /${toKhmerNumber(max)}`
}

export function ChooseLevelClient() {
  const router = useRouter()
  const [key, setKey] = useState<EducationLevelKey>('primary')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    // A hint for the signed-in wizard, validated again server-side — see
    // lib/onboarding/pendingLevel.ts for why nothing authoritative exists yet.
    writePendingLevel(key)
    router.push('/login')
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-lg rounded-xl border border-divider bg-bg-surface p-6 shadow-md md:p-8"
    >
      <header className="mb-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- static logo, matching the login screen */}
        <img src="/logo.png" alt="KruSmart" className="mx-auto mb-4 h-16 object-contain" />
        <h1 className="kh-moul text-xl text-brand">ជ្រើសរើសកម្រិតសិក្សា</h1>
        <p className="mt-2 text-sm text-text-muted">
          តើអ្នកបង្រៀននៅកម្រិតសិក្សាណា? ប្រព័ន្ធពិន្ទុនឹងរៀបចំតាមកម្រិតនេះ។
        </p>
      </header>

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
              description={`${level.description} · ${scaleLabel(level.key)}`}
              meta={gradeRangeLabel(level)}
            />
          )
        })}
      </fieldset>

      <Button type="submit" size="lg" className="mt-6 w-full" icon={<ArrowRight className="h-5 w-5" />}>
        បន្តទៅការចូលគណនី
      </Button>

      <p className="mt-4 text-center text-xs text-text-muted">
        មានគណនីរួចហើយ?{' '}
        <a href="/login" className="font-bold text-brand hover:underline">
          ចូលគណនីផ្ទាល់
        </a>
      </p>
    </form>
  )
}
