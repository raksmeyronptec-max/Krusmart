'use client'

import { Trophy, TrendingDown, BarChart3 } from 'lucide-react'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { formatMark, styleFor } from '@/lib/utils/score-band'
import { DEFAULT_SCHEME_CONFIG, type GradingSchemeConfig } from '@/lib/grading/scheme'
import type { SubjectPerformance } from '@/lib/scores/totals'

/**
 * មធ្យមភាគតាមមុខវិជ្ជា — how the class is doing, subject by subject (§13).
 *
 * A bar per subject rather than a chart library: there are between three and
 * eight subjects and the only comparison being made is "which of these is
 * lower", which a width already answers. Recharts is loaded for the analytics
 * drawer's distribution and trend, where the shape genuinely carries meaning;
 * pulling it in here would add a second rendering path for a ranked list.
 *
 * The bar is drawn as a share of each subject's OWN full mark, which is why
 * `maxScore` travels with the row. Comparing a raw 8 against a raw 45 would
 * make every /50 subject look like the strong one.
 *
 * Subjects come from the class's template — the caller narrows them — so a
 * subject the class does not teach cannot appear here even with marks in the
 * table from a previous configuration.
 */
export function ScoreTotalSubjectPerformance({
  subjects,
  scheme = DEFAULT_SCHEME_CONFIG,
  onSelectSubject,
  activeSubject,
}: {
  subjects: SubjectPerformance[]
  scheme?: GradingSchemeConfig
  /** Filter the table to this subject. Omit to make the rows inert. */
  onSelectSubject?: (name: string | null) => void
  activeSubject?: string | null
}) {
  if (subjects.length === 0) return null

  // Already sorted strongest-first by `subjectPerformance`.
  const strongest = subjects[0]
  const weakest = subjects[subjects.length - 1]
  const showExtremes = subjects.length > 1

  return (
    <section
      aria-labelledby="subject-performance-heading"
      className="rounded-xl border border-divider bg-bg-surface p-4 shadow-sm"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="subject-performance-heading"
          className="flex items-center gap-2 text-sm font-bold text-text-heading"
        >
          <BarChart3 className="h-4 w-4 text-brand" aria-hidden="true" />
          មធ្យមភាគតាមមុខវិជ្ជា
        </h2>
        {activeSubject && onSelectSubject && (
          <button
            type="button"
            onClick={() => onSelectSubject(null)}
            className="text-xs font-bold text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            បង្ហាញទាំងអស់
          </button>
        )}
      </div>

      {showExtremes && (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <Extreme
            icon={<Trophy className="h-4 w-4 text-gold" aria-hidden="true" />}
            label="មុខវិជ្ជាខ្លាំងបំផុត"
            name={strongest.name}
            average={strongest.average}
            scheme={scheme}
          />
          <Extreme
            icon={<TrendingDown className="h-4 w-4 text-danger" aria-hidden="true" />}
            label="មុខវិជ្ជាខ្សោយបំផុត"
            name={weakest.name}
            average={weakest.average}
            scheme={scheme}
          />
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {subjects.map((subject) => {
          const ratio = Math.max(0, Math.min(1, subject.average / subject.maxScore))
          const style = styleFor(subject.average * (scheme.maxScore / subject.maxScore), scheme)
          const isActive = activeSubject === subject.name
          const weakestColumn = subject.columns[0]

          const body = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13px] font-bold text-text-heading">
                  {subject.name}
                </span>
                <span className={`shrink-0 text-sm font-bold tabular-nums ${style.text}`}>
                  {formatMark(subject.average)}
                  <span className="ml-1 text-[11px] font-normal text-text-muted">
                    /{toKhmerNumber(subject.maxScore)}
                  </span>
                </span>
              </div>

              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper"
                role="img"
                aria-label={`${subject.name} មធ្យមភាគ ${formatMark(subject.average)} លើ ${subject.maxScore}`}
              >
                <div
                  className={`h-full rounded-full ${style.bar}`}
                  style={{ width: `${ratio * 100}%` }}
                />
              </div>

              <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-text-muted">
                <span>ពិន្ទុ {toKhmerNumber(subject.count)}</span>
                {/* The component pulling the subject down — the "where exactly"
                    a subject average alone cannot answer. */}
                {subject.columns.length > 1 && weakestColumn && (
                  <span>ខ្សោយ៖ {weakestColumn.label} {formatMark(weakestColumn.average)}</span>
                )}
              </p>
            </>
          )

          return (
            <li key={subject.name}>
              {onSelectSubject ? (
                <button
                  type="button"
                  onClick={() => onSelectSubject(isActive ? null : subject.name)}
                  aria-pressed={isActive}
                  className={`w-full rounded-lg border p-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                    isActive ? 'border-brand bg-brand-100 dark:bg-brand-900/30' : 'border-transparent hover:border-divider hover:bg-paper'
                  }`}
                >
                  {body}
                </button>
              ) : (
                <div className="rounded-lg border border-transparent p-2.5">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Extreme({
  icon, label, name, average, scheme,
}: {
  icon: React.ReactNode
  label: string
  name: string
  average: number
  scheme: GradingSchemeConfig
}) {
  return (
    <div className="rounded-lg border border-divider bg-paper p-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-text-muted">
        {icon} {label}
      </p>
      <p className="mt-1 flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-bold text-text-heading">{name}</span>
        <span className={`shrink-0 text-sm font-bold tabular-nums ${styleFor(average, scheme).text}`}>
          {formatMark(average)}
        </span>
      </p>
    </div>
  )
}

export default ScoreTotalSubjectPerformance
