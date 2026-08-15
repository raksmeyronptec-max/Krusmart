'use client'

import { useMemo, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { PortalHeader, EmptyState } from '../../PortalHeader'
import { useParent } from '../../ParentContext'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { gradeFor, simpleAverage } from '@/lib/grading/scheme'
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
  scores, childName, subjectLabels,
}: {
  scores: Score[]
  childName: string
  subjectLabels: Record<string, string>
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
              const avg = simpleAverage(rows.map((r) => r.score_value))
              const result = gradeFor(avg)
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
