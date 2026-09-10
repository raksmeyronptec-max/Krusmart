// Relative, with the extension, so node can load this module directly — the
// same shape `lib/scores/semester.ts` uses, for the same reason.
import { withClassParam } from '../utils/classHref.ts'
import { semesterLabel, type SemesterId } from './semester.ts'

/**
 * The score workspace: one vocabulary and one set of doors, shared by every
 * screen that shows a mark.
 *
 * ── The problem this solves ────────────────────────────────────────────────
 *
 * Marking a class is one job spread over seven screens — `/score/enter`,
 * `/score/total`, `/score/print`, `/score/collect`, `/score/subjects`,
 * `/ranking` and `/score-analyse`. Each had grown its own header, its own
 * period picker and its own words for the same three things:
 *
 *   `/score/enter`  ពិន្ទុប្រចាំខែ · ពិន្ទុប្រចាំឆមាស          (two modes)
 *   `/score/total`  ប្រចាំខែ · ឆមាស · ឆ្នាំ                    (three, differently named)
 *   `/ranking`      monthly · semester · **yearly**            (a third name again)
 *
 * A teacher moving between them had to re-establish where they were at every
 * step: which class, which year, which period, and whether "ឆមាស" here meant
 * the same thing as "ប្រចាំឆមាស" there. That is the "collection of
 * disconnected feature pages" failure in its purest form — every screen
 * correct, the product incoherent.
 *
 * So the vocabulary is declared once, here, and the screens render it.
 *
 * ── The period hierarchy is never hidden ──────────────────────────────────
 *
 * MONTHLY → SEMESTER 1 → SEMESTER 2 → ANNUAL is the product's actual
 * assessment ladder, and each rung reads the one below it: a semester is half
 * exam and half the months' coursework (`lib/scores/semester.ts`), a year is
 * its two semesters (`lib/scores/annual.ts`). A screen that shows an average
 * without saying which rung it is on is showing an unlabelled number.
 *
 * Pure and isomorphic: the client screens and the node verification harness
 * read the one copy. Keep it free of `server-only` and of `next/*`.
 */

/**
 * The three rungs, named as `scores.score_type` names them.
 *
 * `annual`, never `yearly`: the column stores `annual`, the shared layer is
 * `lib/scores/annual.ts`, the report is `ranking_annual`. `/ranking` was the
 * one screen using a fourth word and had to translate its own vocabulary on
 * the way to every fetch.
 */
export type ScoreScope = 'monthly' | 'semester' | 'annual'

export interface ScoreScopeSpec {
  id: ScoreScope
  /** How the rung is named in a control — a noun the teacher picks. */
  label: string
  /** What it is, in one line, for a tooltip or a description. */
  hint: string
}

export const SCORE_SCOPES: readonly ScoreScopeSpec[] = [
  { id: 'monthly', label: 'ប្រចាំខែ', hint: 'ពិន្ទុប្រចាំខែនីមួយៗ' },
  { id: 'semester', label: 'ប្រចាំឆមាស', hint: 'ពិន្ទុប្រឡង និងពិន្ទុប្រចាំខែក្នុងឆមាស' },
  { id: 'annual', label: 'ប្រចាំឆ្នាំ', hint: 'លទ្ធផលរួមនៃឆមាសទាំងពីរ' },
] as const

export function scopeLabel(scope: ScoreScope): string {
  return SCORE_SCOPES.find((s) => s.id === scope)?.label ?? ''
}

/** Guard for a scope arriving from a URL. */
export function isScoreScope(value: unknown): value is ScoreScope {
  return value === 'monthly' || value === 'semester' || value === 'annual'
}

/** Which period a screen is currently showing. */
export interface ScorePeriodSelection {
  scope: ScoreScope
  /**
   * The chosen period's Khmer label — `ខែវិច្ឆិកា`, or a merged period's own
   * label. Comes from the class's calendar (`lib/scores/calendar.ts`), never
   * from a month table, so a school that merges មីនា–មេសា reads its own name
   * back. Only meaningful when `scope` is `monthly`.
   */
  monthLabel?: string | null
  /** Only meaningful when `scope` is `semester`. */
  semester?: SemesterId
}

/**
 * The one phrase naming the period, wherever it is shown.
 *
 * Three screens each built this with their own inline ternary and reached
 * three slightly different answers. One function, one answer.
 */
export function periodLabel(selection: ScorePeriodSelection): string {
  if (selection.scope === 'annual') return 'ប្រចាំឆ្នាំ'
  if (selection.scope === 'semester') return semesterLabel(selection.semester ?? 'sem1')
  return selection.monthLabel ? `ខែ${selection.monthLabel}` : 'ប្រចាំខែ'
}

// ---------------------------------------------------------------------------
// The doors
// ---------------------------------------------------------------------------

export interface ScoreWorkspaceTab {
  id: string
  label: string
  href: string
  /**
   * Does this destination read `mode` / `year` / `month` / `semester`?
   *
   * DECLARED, not assumed. Carrying a period to a screen that ignores it puts a
   * claim in the address bar the page does not honour — and gets copied into a
   * shared link. `/ranking` and `/score-analyse` hold their period in local
   * state and open on a picker, so they take the class and the year only.
   *
   * `scripts/verify-score-workspace.mts` checks this against what the pages
   * actually read, in both directions.
   */
  carriesPeriod: boolean
}

/**
 * The workspace's secondary navigation, in the order the work happens:
 * enter the marks, read the totals, rank them, look for the pattern — and see
 * how much is still missing.
 *
 * `/score/collect` is the fifth door, and it belongs here rather than in the
 * menu it used to hide in (`hidden: true`, under ពិន្ទុ). "How much of this
 * period is still unmarked" is the question a teacher asks *between* entering
 * and reading, and it was reachable only from the dashboard's progress tile.
 * `lib/scores/completion.ts` already guarantees it and the dashboard count the
 * same figure; putting it in the strip means the teacher can get to it from the
 * grid they are looking at.
 *
 * `/score/subjects` is deliberately NOT a tab. It configures *what the class
 * assesses*, which is a different question from *what the pupils scored*, and
 * it is reached from the picker on `/score/enter` and from `/classroom`. A
 * configuration screen sitting in a row of result screens invites a teacher to
 * change the curriculum while looking for a mark.
 *
 * `/score/print` is not a tab either: it is a DOCUMENT, and documents are
 * indexed in the Print Center (§27). A tab strip that mixed screens and sheets
 * would be the competing document menu that index exists to replace.
 */
export const SCORE_WORKSPACE_TABS: readonly ScoreWorkspaceTab[] = [
  { id: 'enter', label: 'បញ្ចូលពិន្ទុ', href: '/score/enter', carriesPeriod: true },
  { id: 'total', label: 'តារាងសរុប', href: '/score/total', carriesPeriod: true },
  { id: 'collect', label: 'ការប្រមូលពិន្ទុ', href: '/score/collect', carriesPeriod: false },
  { id: 'ranking', label: 'ចំណាត់ថ្នាក់', href: '/ranking', carriesPeriod: false },
  /*
   * The honour roll is a door, not a leaf.
   *
   * It was the only member of the លទ្ធផល module without this strip — no header,
   * no `useClassHref`, no `href` of any kind — so a teacher who arrived could
   * leave only through the sidebar or the browser's back button (Phase 12 F7).
   * Its three siblings were all already here; it is the same question they
   * answer, asked of a subset of the class.
   *
   * `carriesPeriod: false` for the reason `/ranking` and `/score-analyse` have
   * it: the screen opens on a picker and holds its period in local state, so a
   * `?mode=` would be a claim the address bar makes and the page ignores.
   */
  { id: 'honor', label: 'កិត្តិយស', href: '/honor-roll', carriesPeriod: false },
  { id: 'analysis', label: 'វិភាគ', href: '/score-analyse', carriesPeriod: false },
] as const

export interface WorkspaceHrefOptions {
  classId?: string | null
  academicYear?: string
  selection?: ScorePeriodSelection
  /** The month id (`nov`), not its label — this is a URL, not a heading. */
  monthId?: string
}

/**
 * Where a workspace tab should actually point.
 *
 * The class always travels (`withClassParam`, the app-wide rule). The period
 * travels only to a tab that declares it reads one, and `/score/enter` has no
 * `annual` mode — a teacher does not type a year's result, it is derived — so
 * an annual selection arrives there as `monthly`, which is the rung its marks
 * are actually entered on.
 */
export function workspaceTabHref(tab: ScoreWorkspaceTab, options: WorkspaceHrefOptions): string {
  const params = new URLSearchParams()

  if (options.academicYear) params.set('year', options.academicYear)

  const selection = options.selection
  if (tab.carriesPeriod && selection) {
    const scope = tab.href === '/score/enter' && selection.scope === 'annual'
      ? 'monthly'
      : selection.scope
    params.set('mode', scope)
    if (scope === 'monthly' && options.monthId) params.set('month', options.monthId)
    if (scope === 'semester') params.set('semester', selection.semester ?? 'sem1')
  }

  const query = params.toString()
  return withClassParam(query ? `${tab.href}?${query}` : tab.href, options.classId)
}
