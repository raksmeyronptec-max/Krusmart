'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, CalendarDays, GraduationCap, SlidersHorizontal } from 'lucide-react'

import { useActiveClass } from '@/lib/hooks/useActiveClass'
import { useClassHref } from '@/lib/hooks/useClassHref'
import {
  SCORE_WORKSPACE_TABS,
  periodLabel,
  workspaceTabHref,
  type ScorePeriodSelection,
} from '@/lib/scores/workspace'

/**
 * The header every score screen wears.
 *
 * ── What it is for ────────────────────────────────────────────────────────
 *
 * Five questions, answered the same way on every screen that shows a mark:
 *
 *   What am I doing?      the title
 *   Which class?          the context row's first chip
 *   Which academic year?  the second
 *   Which period?         the third — and which *rung* of the ladder it is on
 *   What happens next?    the tabs, and the actions slot
 *
 * Before this, each screen answered a different subset in a different order
 * with different words: `/score/enter` named the level but never the class,
 * `/score/total` named the period but called the rungs ប្រចាំខែ · ឆមាស · ឆ្នាំ
 * while `/score/enter` called two of them ពិន្ទុប្រចាំខែ · ពិន្ទុប្រចាំឆមាស, and
 * `/ranking` called the third one `yearly`. A teacher crossing between them
 * had to work out each time whether they were still looking at the same class.
 *
 * The vocabulary is `lib/scores/workspace.ts`'s, not this component's — so a
 * screen cannot rename a rung by rendering it differently.
 *
 * ── The class is named, not assumed ───────────────────────────────────────
 *
 * `useActiveClass` is the same selection the top bar shows and the same one
 * `?class=` carries to the server, so the name here and the marks below it are
 * the same class by construction. A pre-V2 account has no class row; the chip
 * says so rather than printing an empty string, because "—" is a true answer
 * and a blank is an unanswered question.
 */
export interface ScoreWorkspaceHeaderProps {
  title: string
  description?: string
  /** The academic year the screen is showing. */
  academicYear: string
  /** Which rung, and which period on it. Omitted where a screen has no period. */
  selection?: ScorePeriodSelection
  /** The month id (`nov`) for tab links — the label is for reading, this is for URLs. */
  monthId?: string
  /** The subject being marked, when the screen is about one. */
  subjectLabel?: string | null
  /** The class's curriculum said out loud — `បឋមសិក្សា · ថ្នាក់ទី៥`. */
  levelLabel?: string | null
  /** Buttons belonging to the screen: save, export, print. */
  actions?: React.ReactNode
  /** Extra notes the screen wants beside the context — a role, a provenance. */
  notes?: React.ReactNode
}

export function ScoreWorkspaceHeader({
  title,
  description,
  academicYear,
  selection,
  monthId,
  subjectLabel,
  levelLabel,
  actions,
  notes,
}: ScoreWorkspaceHeaderProps) {
  const pathname = usePathname()
  const { className, classId } = useActiveClass()
  const classHref = useClassHref()

  return (
    <header className="mb-4 rounded-xl border border-divider bg-bg-surface p-4 shadow-sm md:p-5 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="kh-moul text-lg text-brand md:text-xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {/* ------------------------------------------------------ context row */}
      {/*
        A description list, not a row of spans: each fact is a term and a value,
        so a screen reader announces "ថ្នាក់, ៥ខ" rather than reading four
        unlabelled words in sequence.
      */}
      <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Fact icon={<GraduationCap className="h-4 w-4 text-brand" />} term="ថ្នាក់">
          {className || '—'}
        </Fact>
        <Fact icon={<CalendarDays className="h-4 w-4 text-brand" />} term="ឆ្នាំសិក្សា">
          {academicYear}
        </Fact>
        {subjectLabel && (
          <Fact icon={<BookOpen className="h-4 w-4 text-brand" />} term="មុខវិជ្ជា">
            {subjectLabel}
          </Fact>
        )}
        {selection && <Fact term="វគ្គ">{periodLabel(selection)}</Fact>}
        {levelLabel && (
          <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-800 dark:bg-brand-900/40 dark:text-brand-300">
            {levelLabel}
          </span>
        )}
        {notes}
      </dl>

      {/* ------------------------------------------------------------- tabs */}
      {/*
        `aria-current="page"` rather than colour alone, and a real underline
        rather than a tint, so the current tab survives both a monochrome
        screen and a screen reader.

        The period rides along to the tabs that declare they read one — see
        `ScoreWorkspaceTab.carriesPeriod`. Moving from November's entry grid to
        the totals table should land on November, not on the default month.
      */}
      <nav aria-label="ការងារពិន្ទុ" className="-mb-1 mt-4 border-t border-divider pt-3">
        <ul className="flex flex-wrap gap-1">
          {SCORE_WORKSPACE_TABS.map((tab) => {
            const on = pathname === tab.href || pathname.startsWith(tab.href + '/')
            return (
              <li key={tab.id}>
                <Link
                  href={workspaceTabHref(tab, {
                    classId,
                    academicYear,
                    selection,
                    monthId,
                  })}
                  aria-current={on ? 'page' : undefined}
                  className={`flex min-h-11 items-center rounded-lg px-3 text-[13px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                    on
                      ? 'bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-300'
                      : 'text-text-body hover:bg-paper hover:text-brand'
                  }`}
                >
                  {tab.label}
                </Link>
              </li>
            )
          })}

          {/*
            Configuration, held apart from the four result tabs on purpose:
            "what does this class assess" is a different question from "what did
            these pupils score", and a teacher hunting for a mark should not
            find the curriculum editor in the same row.
          */}
          <li className="ml-auto">
            <Link
              href={classHref('/score/subjects')}
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold text-text-muted transition-colors hover:bg-paper hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              មុខវិជ្ជាតាមថ្នាក់
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  )
}

function Fact({
  icon,
  term,
  children,
}: {
  icon?: React.ReactNode
  term: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {icon && <span aria-hidden="true" className="shrink-0">{icon}</span>}
      <dt className="shrink-0 text-text-muted">{term}</dt>
      <dd className="kh-truncate font-bold text-text-heading">{children}</dd>
    </div>
  )
}

export default ScoreWorkspaceHeader
