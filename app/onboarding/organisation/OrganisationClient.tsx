'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { School, Building2, User, ArrowRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import { ChoiceCard } from '@/components/onboarding/ChoiceCard'
import { StepHeading } from '@/components/onboarding/StepHeading'
import { notify } from '@/components/ui/feedback/notify'
import { createOrganisation } from '../actions'

/** The three organisation types §7 names, mapped to `schools.settings.kind`. */
const KINDS = [
  { value: 'school', title: 'សាលារៀន', description: 'សាលារដ្ឋ ឬឯកជន', Icon: School },
  { value: 'center', title: 'មជ្ឈមណ្ឌលអប់រំ', description: 'មជ្ឈមណ្ឌលបណ្តុះបណ្តាល ឬថ្នាក់គួរ', Icon: Building2 },
  { value: 'independent', title: 'គ្រូឯករាជ្យ', description: 'បង្រៀនដោយខ្លួនឯង មិនមានសាលា', Icon: User },
]

export function OrganisationClient({
  existing,
}: {
  existing: { id: string; name: string } | null
}) {
  const [kind, setKind] = useState('school')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(!existing)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await createOrganisation(name, kind)
      // A successful action redirects and never returns; anything here failed.
      if (result?.error) {
        setError(result.error)
        notify.error(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <StepHeading title="ជ្រើសរើសស្ថាប័ន" question="តើអ្នកកំពុងបង្រៀននៅស្ថាប័នណា?" />

      {existing && (
        <section aria-labelledby="mine" className="flex flex-col gap-3">
          <h2 id="mine" className="text-sm font-bold text-text-heading">
            ស្ថាប័នរបស់ខ្ញុំ
          </h2>

          <Link
            href="/onboarding/level"
            className="flex min-h-11 items-center gap-3 rounded-xl border border-divider bg-bg-surface p-4 transition-colors hover:border-brand-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand dark:bg-brand-900/60 dark:text-brand-300"
            >
              <School className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1 text-sm font-bold text-text-heading">
              {existing.name}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          </Link>

          {!creating && (
            <Button
              type="button"
              variant="secondary"
              icon={<Plus className="h-4 w-4" aria-hidden="true" />}
              onClick={() => setCreating(true)}
            >
              បង្កើតស្ថាប័នថ្មី
            </Button>
          )}
        </section>
      )}

      {creating && (
        <form onSubmit={submit} className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-bold text-text-heading">ប្រភេទស្ថាប័ន</legend>
            {KINDS.map((k) => (
              <ChoiceCard
                key={k.value}
                name="kind"
                value={k.value}
                checked={kind === k.value}
                onChange={setKind}
                icon={<k.Icon className="h-5 w-5" />}
                title={k.title}
                description={k.description}
              />
            ))}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="org-name" className="text-sm font-bold text-text-heading">
              ឈ្មោះស្ថាប័ន
            </label>
            <input
              id="org-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="organization"
              aria-describedby={error ? 'org-error' : undefined}
              aria-invalid={error ? true : undefined}
              placeholder="ឧ. សាលាបឋមសិក្សា ភ្នំពេញថ្មី"
              className="min-h-11 rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            />
            {/* Text, not colour alone — §28/§6. */}
            {error && (
              <p id="org-error" role="alert" className="text-xs font-medium text-danger">
                {error}
              </p>
            )}
          </div>

          <Button type="submit" size="lg" loading={pending} disabled={!name.trim()}>
            បន្ត
          </Button>
        </form>
      )}
    </div>
  )
}
