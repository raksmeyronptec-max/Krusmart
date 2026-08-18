'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  School, Building2, User, ArrowRight, Plus, Search, Clock, X,
  CheckCircle2, MapPin, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import { ChoiceCard } from '@/components/onboarding/ChoiceCard'
import { StepHeading } from '@/components/onboarding/StepHeading'
import { notify } from '@/components/ui/feedback/notify'
import {
  cancelJoinRequest,
  createOrganisation,
  requestToJoin,
  searchOrganisations,
  type OrganisationSearchResult,
} from '../actions'

/** The three organisation types §7 names, mapped to `schools.settings.kind`. */
const KINDS = [
  { value: 'school', title: 'សាលារៀន', description: 'សាលារដ្ឋ ឬឯកជន', Icon: School },
  { value: 'center', title: 'មជ្ឈមណ្ឌលអប់រំ', description: 'មជ្ឈមណ្ឌលបណ្តុះបណ្តាល ឬថ្នាក់គួរ', Icon: Building2 },
  { value: 'independent', title: 'គ្រូឯករាជ្យ', description: 'បង្រៀនដោយខ្លួនឯង មិនមានសាលា', Icon: User },
]

/** One row of `my_join_requests()` — the requester's own history, school name included. */
export interface JoinRequestSummary {
  id: string
  school_id: string
  school_name: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

/**
 * Step 1 of onboarding: create an organisation, or ask to join one.
 *
 * Joining is a *request*, never self-service — membership is `user_roles`,
 * whose write policy is admin-only, and an account that could grant itself a
 * role in any school could read its roster. So the join tab searches through
 * the safe-projection RPC, files a `join_requests` row, and then this screen's
 * job is simply to say "pending" honestly until an administrator decides.
 */
export function OrganisationClient({
  existing,
  membershipKind,
  joinRequests,
}: {
  existing: { id: string; name: string } | null
  membershipKind: 'creator' | 'member' | null
  joinRequests: JoinRequestSummary[]
}) {
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [kind, setKind] = useState('school')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(!existing)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // ---- join tab state
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<OrganisationSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [requestingId, setRequestingId] = useState<string | null>(null)

  const pendingRequest = joinRequests.find((r) => r.status === 'pending') ?? null
  const lastRejected =
    !pendingRequest && joinRequests.length > 0 && joinRequests[0].status === 'rejected'
      ? joinRequests[0]
      : null

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

  async function runSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearching(true)
    try {
      setResults(await searchOrganisations(query))
    } finally {
      setSearching(false)
    }
  }

  function sendRequest(school: OrganisationSearchResult) {
    setRequestingId(school.id)
    startTransition(async () => {
      const result = await requestToJoin(school.id)
      if (result?.error) {
        notify.error(result.error)
        setRequestingId(null)
      }
      // Success redirects back to this step, which then shows the pending card.
    })
  }

  function withdraw(requestId: string) {
    startTransition(async () => {
      const result = await cancelJoinRequest(requestId)
      if (result?.error) notify.error(result.error)
    })
  }

  // ---------------------------------------------------------------- member
  // An approved joiner holds only `teacher`: the wizard's level/class writes
  // would be refused by RLS, so continuing would strand them on a form that
  // cannot succeed. Their class arrives as an admin-made assignment.
  if (membershipKind === 'member' && existing) {
    return (
      <div className="flex flex-col gap-6">
        <StepHeading title="ស្ថាប័នរបស់អ្នក" question="អ្នកបានចូលរួមស្ថាប័នរួចហើយ" />

        <div className="flex items-start gap-3 rounded-xl border border-divider bg-bg-surface p-4">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success"
          >
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-heading">{existing.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              គណនីរបស់អ្នកជាសមាជិកនៃស្ថាប័ននេះហើយ។ អ្នកគ្រប់គ្រងសាលានឹងចាត់តាំងថ្នាក់ជូនអ្នក —
              បន្ទាប់ពីនោះ ថ្នាក់នឹងបង្ហាញនៅទំព័រដើមដោយស្វ័យប្រវត្តិ។
            </p>
          </div>
        </div>

        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          ទៅទំព័រដើម <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <StepHeading title="ជ្រើសរើសស្ថាប័ន" question="តើអ្នកកំពុងបង្រៀននៅស្ថាប័នណា?" />

      {/* ------------------------------------------------- pending request */}
      {pendingRequest && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning"
          >
            <Clock className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-text-heading">
              កំពុងរង់ចាំការអនុម័ត — {pendingRequest.school_name}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              សំណើរបស់អ្នកបានផ្ញើទៅអ្នកគ្រប់គ្រងស្ថាប័នហើយ។ អ្នកនឹងអាចប្រើប្រាស់បាន
              បន្ទាប់ពីគេអនុម័ត។
            </p>
            <button
              type="button"
              onClick={() => withdraw(pendingRequest.id)}
              disabled={pending}
              className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-bold text-danger hover:underline disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" /> ដកសំណើវិញ
            </button>
          </div>
        </div>
      )}

      {lastRejected && (
        <p className="rounded-xl bg-paper px-4 py-3 text-xs leading-relaxed text-text-muted">
          សំណើចូលរួម <span className="font-bold">{lastRejected.school_name}</span>{' '}
          មិនត្រូវបានអនុម័តទេ។ អ្នកអាចស្នើសុំម្តងទៀត ស្វែងរកស្ថាប័នផ្សេង ឬបង្កើតថ្មី។
        </p>
      )}

      {/* ------------------------------------------------- creator resume */}
      {existing && membershipKind === 'creator' && (
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

      {/* ------------------------------------------------------ mode tabs */}
      {(creating || !existing) && (
        <div role="tablist" aria-label="របៀបភ្ជាប់ស្ថាប័ន" className="flex gap-1 rounded-xl bg-paper p-1">
          {([
            { id: 'create' as const, label: 'បង្កើតថ្មី' },
            { id: 'join' as const, label: 'ចូលរួមស្ថាប័នមានស្រាប់' },
          ]).map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                mode === id ? 'bg-bg-surface text-brand shadow-sm' : 'text-text-muted hover:text-brand'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------ create tab */}
      {(creating || !existing) && mode === 'create' && (
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

      {/* -------------------------------------------------------- join tab */}
      {(creating || !existing) && mode === 'join' && (
        <div className="flex flex-col gap-4">
          <form onSubmit={runSearch} className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="វាយឈ្មោះសាលា… (យ៉ាងតិច ២ តួអក្សរ)"
                aria-label="ស្វែងរកស្ថាប័ន"
                className="min-h-11 w-full rounded-lg border border-divider bg-bg-surface pr-3 pl-9 text-sm text-text-body placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              />
            </div>
            <Button type="submit" loading={searching} disabled={query.trim().length < 2}>
              ស្វែងរក
            </Button>
          </form>

          {results !== null && results.length === 0 && (
            <p className="rounded-xl bg-paper px-4 py-6 text-center text-sm text-text-muted">
              រកមិនឃើញស្ថាប័នដែលមានឈ្មោះនេះទេ។ ពិនិត្យអក្ខរាវិរុទ្ធ ឬបង្កើតថ្មី។
            </p>
          )}

          {results && results.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {results.map((school) => (
                <li
                  key={school.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-divider bg-bg-surface p-4"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand dark:bg-brand-900/60 dark:text-brand-300"
                  >
                    <School className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-text-heading">{school.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
                      {school.address && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" aria-hidden="true" /> {school.address}
                        </span>
                      )}
                      {school.levels.length > 0 && <span>{school.levels.join(' · ')}</span>}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending || pendingRequest !== null}
                    onClick={() => sendRequest(school)}
                  >
                    {requestingId === school.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      'ស្នើសុំចូលរួម'
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs leading-relaxed text-text-muted">
            ការស្នើសុំត្រូវរង់ចាំការអនុម័តពីអ្នកគ្រប់គ្រងស្ថាប័ន — មុនពេលនោះ
            គណនីរបស់អ្នកមិនអាចមើលទិន្នន័យសាលាបានទេ។
          </p>
        </div>
      )}
    </div>
  )
}
