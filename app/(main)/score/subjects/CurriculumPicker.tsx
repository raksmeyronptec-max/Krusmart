'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/actions/Button'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { Badge } from '@/components/ui/feedback/Badge'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { buildCatalog, searchCatalog } from '@/lib/scores/selection'
import type { ClassSubjectSelection } from '@/lib/scores/selection'
import type { EffectiveSubject } from '@/lib/scores/template'

/**
 * "បន្ថែមមុខវិជ្ជា" — pick subjects from the class's own curriculum (§8).
 *
 * The whole contract of this component is what it *cannot* do: there is no text
 * field for a subject name. Every row comes from `subjects`, which the server
 * resolved for this class's level and grade, so a teacher can add ភាសាខ្មែរ but
 * cannot invent a national subject here (§7). Adding one of their own is a
 * different, deliberately separate action on the parent screen.
 *
 * Subjects already in the template are shown, disabled and ticked, rather than
 * filtered out. A teacher looking for អាន needs to see that it is already there;
 * silently omitting it reads as "this curriculum doesn't have it" and sends them
 * to invent a duplicate — which is the §22 failure this prevents in the UI, one
 * of three layers with the server action and the unique index.
 */
export function CurriculumPicker({
  open,
  onClose,
  subjects,
  selection,
  onAdd,
  busy,
}: {
  open: boolean
  onClose: () => void
  /** The class's resolved curriculum for the score type being configured. */
  subjects: EffectiveSubject[]
  selection: ClassSubjectSelection[]
  onAdd: (subjectKeys: string[]) => Promise<boolean>
  busy: boolean
}) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)

  // Reopening must not resurrect the previous session's ticks — a teacher who
  // cancelled, then reopened, has said "not those".
  //
  // Adjusted during render rather than in an effect: React re-runs this
  // component before committing, so the reset lands in the same pass instead of
  // painting the stale selection first and correcting it after.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setQuery('')
      setPicked(new Set())
    }
  }

  const catalog = useMemo(() => buildCatalog(subjects, selection), [subjects, selection])
  const results = useMemo(() => searchCatalog(catalog, query), [catalog, query])

  const available = useMemo(
    () => catalog.reduce((n, g) => n + g.subjects.filter((s) => !s.selected).length, 0),
    [catalog],
  )

  const toggle = (key: string) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const submit = async () => {
    if (picked.size === 0) return
    const ok = await onAdd([...picked])
    if (ok) onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="បន្ថែមមុខវិជ្ជា"
      description="ជ្រើសរើសមុខវិជ្ជាពីកម្មវិធីសិក្សារបស់ថ្នាក់នេះ"
      footer={
        <>
          <Button variant="secondary" printHidden={false} onClick={onClose}>
            បោះបង់
          </Button>
          <Button printHidden={false} onClick={submit} loading={busy} disabled={picked.size === 0}>
            បន្ថែម {picked.size > 0 ? toKhmerNumber(picked.size) : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* ------------------------------------------------------- search */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ស្វែងរកមុខវិជ្ជា..."
            aria-label="ស្វែងរកមុខវិជ្ជា"
            className="min-h-11 w-full rounded-lg border border-divider bg-bg-surface pl-10 pr-10 text-sm text-text-body placeholder:text-text-muted focus:border-brand focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); searchRef.current?.focus() }}
              aria-label="សម្អាតការស្វែងរក"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* -------------------------------------------------------- groups */}
        {/*
          Capped height with its own scroll: the primary curriculum runs to
          thirty-four monthly subjects, and letting the dialog grow to fit them
          would push the footer buttons off a phone screen.
        */}
        <div className="max-h-[min(60vh,28rem)] overflow-y-auto rounded-lg border border-divider">
          {results.length === 0 ? (
            <EmptyState
              kind="filtered"
              title="រកមិនឃើញមុខវិជ្ជា"
              description={
                available === 0
                  ? 'មុខវិជ្ជាទាំងអស់ក្នុងកម្មវិធីសិក្សាត្រូវបានបន្ថែមរួចហើយ។'
                  : 'គ្មានមុខវិជ្ជាត្រូវនឹងពាក្យស្វែងរកនេះទេ។'
              }
            />
          ) : (
            results.map((group) => (
              <fieldset key={group.label} className="border-0 p-0">
                <legend className="sticky top-0 z-10 w-full bg-paper px-3 py-2 text-xs font-bold text-text-heading">
                  {group.label}
                </legend>

                <ul>
                  {group.subjects.map((subject) => {
                    const checked = subject.selected || picked.has(subject.subjectKey)
                    const inputId = `curriculum-${subject.subjectKey}`

                    return (
                      <li key={subject.subjectKey} className="border-t border-divider first:border-t-0">
                        <label
                          htmlFor={inputId}
                          className={`flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5 transition ${
                            subject.selected
                              ? 'cursor-not-allowed opacity-55'
                              : 'hover:bg-paper'
                          }`}
                        >
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={checked}
                            disabled={subject.selected || busy}
                            onChange={() => toggle(subject.subjectKey)}
                            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                          />

                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-text-heading">
                                {subject.labelKm}
                              </span>
                              {/*
                                §10: a subject the teacher added must stay
                                visibly distinct from one the ministry defines,
                                even though both now live in one table.
                              */}
                              {subject.teacherAdded && (
                                <Badge variant="info" size="sm">គ្រូបន្ថែម</Badge>
                              )}
                              {subject.selected && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand">
                                  <Check className="h-3 w-3" aria-hidden="true" /> មានរួចហើយ
                                </span>
                              )}
                            </span>

                            {subject.columns.length > 1 && (
                              <span className="mt-0.5 block truncate text-xs text-text-muted">
                                {subject.columns.map((c) => c.label).join(' • ')}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </fieldset>
            ))
          )}
        </div>

        <p className="text-[11px] text-text-muted">
          មុខវិជ្ជាទាំងនេះមកពីកម្មវិធីសិក្សាដែលប្រព័ន្ធកំណត់សម្រាប់កម្រិត និងថ្នាក់របស់អ្នក។
          បើចង់បង្កើតមុខវិជ្ជាផ្ទាល់ខ្លួន សូមប្រើ «បង្កើតមុខវិជ្ជាផ្ទាល់ខ្លួន»។
        </p>
      </div>
    </Dialog>
  )
}
