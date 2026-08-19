'use client'

import { useMemo, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { PortalHeader, EmptyState } from '../../PortalHeader'
import { useParent } from '../../ParentContext'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { gradeFor, type GradingSchemeConfig } from '@/lib/grading/scheme'
import { studentAverage } from '@/lib/scores/aggregate'
import type { Score } from '@/lib/types'

/**
 * Grades by period.
 *
 * Subject labels come from the app's standard set. Teacher-defined custom
 * subjects live in `localStorage` on the teacher's own device, so a parent's
 * browser cannot resolve them — those keys render as their raw id until that
 * store moves to Supabase (Phase 11.5).
 */
export default function GradesClient({
  scores, childName, subjectLabels, scheme, maxByColumn,
}: {
  scores: Score[]
  childName: string
  subjectLabels: Record<string, string>
  /** The child's grading scheme, resolved from their enrolment on the server. */
  scheme: GradingSchemeConfig
  /** Full mark per subject, so a /75 mark is weighted as a /75 mark. */
  maxByColumn: Record<string, number>
}) {
  const { t } = useParent()
  const [mode, setMode] = useState<'monthly' | 'semester'>('monthly')

  const periods = useMemo(() => {
    const filtered = scores.filter((s) => s.score_type === mode)
    const byPeriod = new Map<string, Score[]>()
    for (const s of filtered) {
      byPeriod.set(s.score_period, [...(byPeriod.get(s.score_period) ?? []), s])
    }
    return [...byPeriod.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [scores, mode])

  return (
    <>
      <PortalHeader titleKey="grades_title" subtitle={childName} />

      <section className="px-4 py-6">
        <div className="mb-5 flex gap-2 rounded-2xl border bg-card-dark p-1.5" style={{ borderColor: 'var(--pp-card-border)' }}>
          {(['monthly', 'semester'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="tap-target flex-1 rounded-xl px-4 py-2 text-sm font-bold transition"
              style={
                mode === m
                  ? { background: 'var(--pp-accent)', color: '#fff' }
                  : { color: 'var(--pp-text-muted)' }
              }
            >
              {t(m)}
            </button>
          ))}
        </div>

        {periods.length === 0 ? (
          <EmptyState messageKey="no_scores" icon={<BarChart3 className="h-10 w-10" />} />
        ) : (
          <div className="space-y-4">
            {periods.map(([period, rows]) => {
              // Row-driven — whatever this period holds — but weighted by each
              // subject's full mark, so a secondary child's average is /50.
              const marks: Record<string, number> = {}
              for (const r of rows) {
                if (r.score_value !== null && r.score_value !== undefined) marks[r.subject] = r.score_value
              }
              const { average: avg } = studentAverage(marks, Object.keys(marks), maxByColumn, scheme)
              const result = gradeFor(avg, scheme)
              return (
                <article key={period} className="overflow-hidden rounded-2xl border bg-card-dark" style={{ borderColor: 'var(--pp-card-border)' }}>
                  <header className="flex items-center justify-between border-b p-4" style={{ borderColor: 'var(--pp-card-border)' }}>
                    <span className="font-bold text-pp">{period}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-pp-muted">{t('average')}</span>
                      <span className="text-lg font-bold" style={{ color: 'var(--pp-accent)' }}>
                        {avg === null ? '—' : toKhmerNumber(avg)}
                      </span>
                      {result && (
                        <span className="rounded-lg bg-white/10 px-2 py-0.5 text-xs font-bold text-pp">
                          {result.letter}
                        </span>
                      )}
                    </span>
                  </header>

                  <ul>
                    {rows.map((r) => (
                      <li key={r.id} className="flex items-center justify-between border-b px-4 py-2.5 last:border-0" style={{ borderColor: 'var(--pp-card-border)' }}>
                        <span className="text-sm text-pp">{subjectLabels[r.subject] ?? r.subject}</span>
                        <span className="text-sm font-bold text-pp">
                          {/* A behavioural rating is a Khmer word, not a mark —
                              show it as written rather than as Khmer numerals. */}
                          {r.score_value !== null
                            ? toKhmerNumber(r.score_value)
                            : (r.score_text ?? '—')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}
