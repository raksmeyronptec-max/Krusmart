// Relative, with the extension, so node can load this module directly — the
// same convention `lib/scores/workspace.ts` and `lib/utils/classHref.ts` use,
// and for the same reason: `scripts/verify-result-documents.mts` has no bundler
// and must exercise the real module rather than a regex over its source.
import { withClassParam } from '../utils/classHref.ts'
import type { ScoreScope } from '../scores/workspace.ts'
import type { SemesterId } from '../scores/semester.ts'
import { reportAvailability } from './report-template.ts'
import { reportDefinition, type ReportType } from './report-types.ts'

/**
 * The arrow from a RESULT to the DOCUMENT of it.
 *
 * ── The seam this closes ───────────────────────────────────────────────────
 *
 * The product's mental model is ពិន្ទុ (what I enter) → លទ្ធផល (what I learn) →
 * របាយការណ៍ (what I produce), and until now the third arrow did not exist.
 * `/ranking`, `/honor-roll`, `/score/total` and `/yearly-report` referenced
 * `/print-center` exactly zero times between them: the moment a teacher had the
 * thing they came for — a ranked class — the product offered no route to the
 * printed version of it, and they had to leave through the sidebar already
 * knowing that ranking sheets live under របាយការណ៍ → មជ្ឈមណ្ឌលរបាយការណ៍.
 *
 * ── Why this is a module and not four `<Link>`s ────────────────────────────
 *
 * The four screens ask one question — "which report am I looking at, and can it
 * actually be produced?" — and four inline answers is how they come to disagree
 * about it, which is the same failure `lib/scores/periodResults.ts` was written
 * to end for the arithmetic. Concretely, two rules are easy to get subtly wrong
 * and both fail *silently*, as a button that goes somewhere plausible:
 *
 *   1. THE RUNG DECIDES THE REPORT.  A ranking screen showing ខែធ្នូ produces
 *      `ranking_monthly`, the same screen on the ឆ្នាំ rung produces
 *      `ranking_annual`, and they are different documents with different
 *      resolvers. A link that ignored the rung would print a month's sheet for
 *      a teacher looking at the year.
 *
 *   2. `reportAvailability` DECIDES WHAT MAY BE OFFERED.  A resolver with no
 *      template produces nothing to print onto, and `score_annual` has neither
 *      — so the ឆ្នាំ rung of `/score/total` must not grow a generate button
 *      that fails. It resolves to `annual_summary` instead, which is what
 *      CLAUDE.md already records as its engine equivalent, and anything still
 *      unproducible falls back to the family view rather than to a dead button.
 *
 * THIS INVENTS NO CATALOGUE. Every answer below is read from
 * `REPORT_DEFINITIONS` and `reportAvailability` — the two places allowed to say
 * what a report is and whether it can run. A second list of reports here is
 * exactly the drift the catalogue exists to prevent.
 *
 * Pure and isomorphic: the client screens and the node harness read the one
 * copy. Keep it free of `server-only` and of `next/*`.
 */

/**
 * A screen that shows a result, named by the result rather than by its route.
 *
 * `annual` is `/yearly-report`, which is a hub over the year rather than one
 * table — it produces the yearly family's summary sheet, and its own three
 * sub-sheets are rows in that same family.
 */
export type ResultSurface = 'score_total' | 'ranking' | 'honor' | 'annual'

/** What the screen is currently showing, in the workspace's own vocabulary. */
export interface ResultPeriod {
  scope: ScoreScope
  /** The month id (`nov`), never its Khmer label — this becomes a URL. */
  monthId?: string | null
  semester?: SemesterId | null
}

/**
 * Which report a result screen is the screen *of*, per rung.
 *
 * `score_total` on the ឆ្នាំ rung is the one entry that is not the obvious
 * name: `score_annual` carries `resolver: false` and no template, and CLAUDE.md
 * states that `annual_summary` "is its engine equivalent and prints the same
 * figures". Pointing at `score_annual` would route a teacher to a row that can
 * only offer its own legacy screen — which is `/score/total`, the screen they
 * are standing on.
 */
export function documentForResult(surface: ResultSurface, scope: ScoreScope): ReportType {
  switch (surface) {
    case 'score_total':
      return scope === 'monthly' ? 'score_monthly'
        : scope === 'semester' ? 'score_semester'
        : 'annual_summary'
    case 'ranking':
      return scope === 'monthly' ? 'ranking_monthly'
        : scope === 'semester' ? 'ranking_semester'
        : 'ranking_annual'
    case 'honor':
      return 'honor'
    case 'annual':
      return 'annual_summary'
  }
}

export interface ResultDocumentTarget {
  reportType: ReportType
  /** Where the action points, class and period already attached. */
  href: string
  /** The Khmer label the action wears — it says what actually happens. */
  label: string
  /**
   * Does the destination open the generation flow on that report?
   *
   * `false` means the link opens the report's *family* in the centre, because
   * `reportAvailability` says this report cannot currently produce a file. A
   * button reading បង្កើតរបាយការណ៍ that lands on a row saying មិនទាន់មាន is a
   * promise the product does not keep, so the label changes with the answer.
   */
  generates: boolean
}

export interface ResultDocumentOptions {
  surface: ResultSurface
  period: ResultPeriod
  /** The active class. `null` on a pre-V2 account, which scopes by teacher. */
  classId?: string | null
  /** The year the SCREEN is showing — not necessarily the current one. */
  academicYear?: string | null
}

/**
 * The one document action a results screen offers.
 *
 * ── What travels ──────────────────────────────────────────────────────────
 *
 * The class, through `withClassParam` — never a hand-appended `?class=`, so the
 * rule that decides which routes may carry one stays in a single place. The
 * academic year, because the centre otherwise resolves the *current* one and a
 * teacher reading last year's ranking would silently be handed this year's
 * sheet. And the period, but only in the shape the report itself declares:
 * `honor` is declared `period: 'month'`, so a semester's honour roll carries no
 * period rather than a `semester=` the flow would ignore.
 *
 * The parameter names are `month` / `semester` / `year` — the ones
 * `workspaceTabHref` already uses. A second spelling of the same four facts is
 * how two halves of one journey start disagreeing about what they mean.
 */
export function resultDocument(options: ResultDocumentOptions): ResultDocumentTarget {
  const scope = options.period.scope
  const reportType = documentForResult(options.surface, scope)
  const definition = reportDefinition(reportType)

  // `reportDefinition` returns `undefined` only for a type absent from the
  // catalogue, which the `ReportType` union makes unreachable — but a missing
  // definition must degrade to the index rather than throw inside a render.
  if (!definition) {
    return {
      reportType,
      href: withClassParam('/print-center', options.classId),
      label: 'មជ្ឈមណ្ឌលរបាយការណ៍',
      generates: false,
    }
  }

  const generates = reportAvailability(definition).action === 'generate'

  const params = new URLSearchParams()
  params.set('category', definition.category)
  if (generates) params.set('report', definition.type)
  if (options.academicYear) params.set('year', options.academicYear)

  /*
   * The period travels only where BOTH halves agree it means something: the
   * report has to declare that it takes one of that shape, and the screen has
   * to actually be on that rung.
   *
   * Both halves are load-bearing. `honor` is declared `period: 'month'` while
   * its screen offers all three rungs, so without the second test a semester's
   * honour roll would hand over whichever month the picker happened to be
   * holding — a period the teacher did not choose, printed as though they had.
   */
  if (generates) {
    if (definition.period === 'month' && scope === 'monthly' && options.period.monthId) {
      params.set('month', options.period.monthId)
    }
    if (definition.period === 'semester' && scope === 'semester' && options.period.semester) {
      params.set('semester', options.period.semester)
    }
  }

  return {
    reportType: definition.type,
    href: withClassParam(`/print-center?${params.toString()}`, options.classId),
    label: generates ? 'បង្កើតរបាយការណ៍' : 'មើលរបាយការណ៍',
    generates,
  }
}
