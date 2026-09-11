'use client'

import { usePathname } from 'next/navigation'
import { GraduationCap } from 'lucide-react'

import { useActiveClass } from '@/lib/hooks/useActiveClass'
import { isClassScopedPath } from '@/lib/utils/classHref'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

/**
 * Which class · grade · academic year the page in front of you is about.
 *
 * ── The question this answers ─────────────────────────────────────────────
 *
 * Every screen in the teacher app has to answer "which class am I looking at?"
 * before anything else on it means anything. Phase 0 found that 29 of the 45
 * teacher routes never said — eleven of them resolve the class correctly on the
 * server and then simply never print it, so the numbers are right and the
 * teacher has no way to know which class they belong to. A misread class is not
 * a cosmetic problem: it is a whole screen of plausible, wrong figures.
 *
 * ── What it deliberately is NOT ───────────────────────────────────────────
 *
 * A **presentation** component, and nothing else. It holds no state, it reads
 * `useActiveClass()` like every other consumer, and it is not a class selector.
 * `ClassContextSwitcher` in `TopNav` is the one authoritative place to change
 * class; a second control here would be a second way to write the same state,
 * which is the exact drift `TeacherContext` exists to prevent. When the teacher
 * holds more than one class this points at the switcher instead of duplicating
 * it.
 *
 * ── One list decides where it renders ─────────────────────────────────────
 *
 * `isClassScopedPath` — the *same* predicate that decides whether `withClassParam`
 * appends `?class=` to a link, verified route-by-route against the filesystem by
 * `scripts/verify-class-context.mts`. There is deliberately no second array of
 * route prefixes in this file: a page that carries the class in its URL and a
 * page that names the class on screen must be the same set, or one of the two is
 * lying. Adding a class-scoped route means adding it to `CLASS_SCOPED_ROUTES`,
 * and both behaviours follow.
 *
 * ── The three states, and why the empty one is right ──────────────────────
 *
 *   not class-scoped   `/profile`, `/team`, `/tutorial` — renders nothing. A
 *                      context strip on a page that does not read a class is a
 *                      claim the page does not honour.
 *   legacy / loading   renders nothing *by default*. A pre-V2 account has no
 *                      class entity at all, and inventing a strip for one would
 *                      be a label over an absence — unless the page has
 *                      something true to put there, which is what `legacy` is
 *                      for. See the prop.
 *   resolved           class, grade, year — with an honest `—` for a grade that
 *                      could not be read (`grades_select_member` gates on the
 *                      caller's schools). A wrong grade is worse than an absent
 *                      one, and `className` is free text, so deriving the grade
 *                      back out of it would be a guess.
 *
 * ── The two optional props, and why they are not a loophole ───────────────
 *
 * Both were added so `/print-center` could stop rendering a private copy of
 * this strip (Phase 12 F8). Neither carries state, neither makes this control
 * interactive, and both default to undefined — so the other twenty-five call
 * sites are byte-identical in behaviour. They exist because that page knew two
 * true things this component cannot derive, and dropping them to share the
 * markup would have been a regression dressed up as convergence.
 */
export function ClassContextBar({
  className = '',
  yearLabel: yearOverride,
  legacy,
}: {
  className?: string
  /**
   * The academic year this page is about, when it is not the active class's.
   *
   * `useActiveClass()` reports the year of the current ASSIGNMENT. A page that
   * resolves its own — `/print-center` honours `?year=`, so a teacher can be
   * looking at last year's documents — would otherwise have this strip state
   * one year while the page works in another.
   */
  yearLabel?: string | null
  /**
   * What to say for a pre-V2 account, which has no class row to name.
   *
   * Omit it and the strip renders nothing, as it always has. Supply it and the
   * page is asserting it has a true answer for an account with no class: the
   * Print Center passes `settings.class_name`, which is the name that account
   * prints on every sheet it produces, plus a note saying reports cover the
   * whole roster. That is a fact, not a label over an absence.
   */
  legacy?: { label: string; note?: React.ReactNode } | null
}) {
  const pathname = usePathname()
  const { className: classLabel, gradeName, gradeNumber, academicYearName, hasMultiple, isLegacy, loading } =
    useActiveClass()

  // See the note above: three reasons to render nothing, all of them correct.
  if (!pathname || !isClassScopedPath(pathname)) return null
  if (loading) return null

  /*
   * Whether the account is pre-V2 is decided HERE, from the same
   * `useActiveClass()` every other consumer reads — never from a prop. A page
   * supplies the words for that case; it does not get to declare the case.
   */
  const rosterScoped = isLegacy || !classLabel
  if (rosterScoped && !legacy) return null

  /*
   * `ថ្នាក់ទី ៥` — preferring the grade row's own name over a number we format
   * ourselves, because a school may legitimately have named it something the
   * ladder does not predict. The number is the fallback, and the dash is the
   * fallback's fallback.
   */
  const gradeLabel = rosterScoped
    // A roster-scoped account has no grade row, and 'ថ្នាក់ទី —' there would be
    // a dash standing in for something that does not exist rather than for
    // something unreadable. Omitted entirely instead.
    ? null
    : gradeName ?? (gradeNumber !== null ? `ថ្នាក់ទី${toKhmerNumber(gradeNumber)}` : 'ថ្នាក់ទី —')

  const scopeLabel = rosterScoped ? legacy!.label : classLabel

  const yearValue = yearOverride ?? (rosterScoped ? null : academicYearName)
  const yearText = yearValue ? `ឆ្នាំសិក្សា ${toKhmerNumber(yearValue)}` : null

  return (
    <div
      /*
       * `print:hidden` for the same reason `PageHeader` carries it: this is
       * screen chrome, and an A4 sheet already prints its own class name in its
       * letterhead.
       */
      className={`mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-divider bg-bg-surface px-3 py-2 text-[13px] print:hidden ${className}`}
    >
      <GraduationCap className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />

      {/*
        One labelled group, not three loose spans: a screen reader should hear
        "ថ្នាក់បច្ចុប្បន្ន ៥ក ថ្នាក់ទី៥ ឆ្នាំសិក្សា ២០២៦-២០២៧" as one statement of
        context rather than as three unexplained values.
      */}
      <span className="sr-only">ថ្នាក់បច្ចុប្បន្ន៖</span>

      <span className="kh-truncate font-bold text-text-heading">{scopeLabel}</span>

      {/*
        The separators are decorative, and hidden from assistive technology for
        that reason. Below `sm` the row wraps and the grade/year drop onto their
        own line, which is why the dots are only shown alongside.
      */}
      {gradeLabel && (
        <>
          <span aria-hidden="true" className="hidden text-text-muted sm:inline">·</span>
          <span className="text-text-body">{gradeLabel}</span>
        </>
      )}

      {yearText && (
        <>
          <span aria-hidden="true" className="hidden text-text-muted sm:inline">·</span>
          <span className="text-text-muted">{yearText}</span>
        </>
      )}

      {/*
        Where to change it — a pointer, never a control. On a phone the top
        bar's switcher sits in its own strip below the bar, so "ខាងលើ" is true on
        both layouts.
      */}
      {hasMultiple && !rosterScoped && (
        <span className="ml-auto hidden shrink-0 text-[11px] text-text-muted md:inline">
          ប្តូរថ្នាក់នៅរបារខាងលើ
        </span>
      )}

      {/* The roster-scoped account's own explanation, in the same slot. */}
      {rosterScoped && legacy?.note && (
        <span className="ml-auto max-w-full shrink-0 text-[11px] text-text-muted">
          {legacy.note}
        </span>
      )}
    </div>
  )
}

export default ClassContextBar
