'use client'

import { useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { X, TrendingUp, BarChart3, Trophy, AlertTriangle, ArrowUpRight } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell,
} from 'recharts'
import { useIsClient } from '@/components/ui/overlay/useIsClient'
import { useOverlay } from '@/components/ui/overlay/useOverlay'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { formatMark, letterOrDash, styleFor } from '@/lib/utils/score-band'
import { DEFAULT_SCHEME_CONFIG, type GradingSchemeConfig } from '@/lib/grading/scheme'
import { MONTHS_BY_ACADEMIC_YEAR } from '@/lib/constants/months'
import type { ColumnGroup, TotalledStudent } from './scoreTotalConfig'

/**
 * សម្រាយ — the read-only analysis of whatever the table is currently showing.
 *
 * A slide-over rather than a page because the question it answers ("who needs
 * help, and in what") is asked *while* reading the table, and losing the
 * filters to navigate away would mean setting them again. The deeper,
 * cross-period analysis already has its own screen, linked at the foot.
 *
 * Everything here is derived from the rows passed in, so it always reflects the
 * active filters — including "show only failing", which is the point.
 */

export interface ScoreAnalyticsPanelProps {
  open: boolean
  onClose: () => void
  rows: TotalledStudent[]
  groups: ColumnGroup[]
  /** Per-month class average for the academic year, keyed by month id. */
  monthlyTrend: Record<string, number | null>
  periodLabel: string
  /** The class's grading scheme; every axis, bucket and letter follows it. */
  scheme?: GradingSchemeConfig
}

/**
 * Five equal bands of the scheme's scale. On /10 these are the 0–2 … 8–10
 * histogram this panel always drew; on /50 they scale to 0–10 … 40–50 without
 * anyone hardcoding either.
 */
function bucketsFor(scheme: GradingSchemeConfig) {
  const step = scheme.maxScore / 5
  return Array.from({ length: 5 }, (_, i) => ({
    label: `${toKhmerNumber(Math.round(i * step))}–${toKhmerNumber(Math.round((i + 1) * step))}`,
    min: i * step,
    // The top band is inclusive of the maximum.
    max: i === 4 ? scheme.maxScore + 0.01 : (i + 1) * step,
  }))
}

export function ScoreAnalyticsPanel({
  open,
  onClose,
  rows,
  groups,
  monthlyTrend,
  periodLabel,
  scheme = DEFAULT_SCHEME_CONFIG,
}: ScoreAnalyticsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const isClient = useIsClient()
  useOverlay(open, onClose, panelRef)

  const data = useMemo(() => {
    const scored = rows.filter(r => r.finalAverageForRank > 0)

    const distribution = bucketsFor(scheme).map(b => ({
      name: b.label,
      value: scored.filter(r => r.finalAverageForRank >= b.min && r.finalAverageForRank < b.max).length,
      // Same cut points as before, expressed as fractions of the scale so a
      // /50 histogram colours the way the /10 one always did.
      fill: b.max <= scheme.maxScore * 0.4 ? 'var(--color-danger)'
        : b.max <= scheme.maxScore * 0.6 ? 'var(--color-warning)'
        : b.max <= scheme.maxScore * 0.8 ? 'var(--color-success)'
        : 'var(--brand)',
    }))

    const subjects = groups.flatMap(g => g.columns)
      .filter(c => !c.isText)
      .map(col => {
        const values = rows
          .map(r => Number(r.scores[col.key]))
          .filter(v => Number.isFinite(v))
        return {
          name: col.label,
          avg: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : 0,
          count: values.length,
        }
      })
      .filter(s => s.count > 0)
      .sort((a, b) => a.avg - b.avg)

    const ranked = [...scored].sort((a, b) => b.finalAverageForRank - a.finalAverageForRank)

    const trend = MONTHS_BY_ACADEMIC_YEAR
      .map(m => ({ name: m.label, avg: monthlyTrend[m.id] ?? null }))
      .filter(p => p.avg !== null)

    return {
      distribution,
      subjects,
      top: ranked.slice(0, 5),
      bottom: ranked.slice(-5).reverse(),
      trend,
      scoredCount: scored.length,
    }
  }, [rows, groups, monthlyTrend, scheme])

  if (!isClient || !open) return null

  return createPortal(
    <div
      className="overlay-enter fixed inset-0 z-[100] flex justify-end bg-brand-950/50 backdrop-blur-[2px] print:hidden"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="សម្រាយទិន្នន័យពិន្ទុ"
        tabIndex={-1}
        className="drawer-enter flex h-full w-full max-w-xl flex-col bg-bg-surface shadow-lg outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-divider px-5 py-4">
          <div>
            <h2 className="kh-moul text-base text-brand">សម្រាយទិន្នន័យ</h2>
            <p className="mt-1 text-sm text-text-muted">
              {periodLabel} · សិស្សមានពិន្ទុ {toKhmerNumber(data.scoredCount)}/{toKhmerNumber(rows.length)} នាក់
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="បិទ"
            className="tap-target -mr-1.5 -mt-1 shrink-0 rounded-lg p-2 text-text-muted transition hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {data.scoredCount === 0 ? (
            <p className="py-12 text-center text-sm text-text-muted">
              មិនទាន់មានពិន្ទុគ្រប់គ្រាន់សម្រាប់សម្រាយទេ។
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {/* ------------------------------------------- distribution */}
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-text-heading">
                  <BarChart3 className="h-4 w-4 text-brand" aria-hidden="true" />
                  បំណែងចែកមធ្យមភាគក្នុងថ្នាក់
                </h3>
                <div className="h-52 rounded-xl border border-divider p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.distribution}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--divider)" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={11} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} fontSize={11} />
                      <Tooltip formatter={(v) => [`${Number(v)} នាក់`, 'ចំនួនសិស្ស']} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {data.distribution.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* ---------------------------------------------- subjects */}
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-text-heading">
                  <BarChart3 className="h-4 w-4 text-warning" aria-hidden="true" />
                  មធ្យមភាគតាមមុខវិជ្ជា
                  <span className="font-normal text-text-muted">(ទាបបំផុតនៅលើគេ)</span>
                </h3>
                <div
                  className="rounded-xl border border-divider p-2"
                  style={{ height: Math.max(160, data.subjects.length * 26 + 30) }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.subjects} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--divider)" />
                      <XAxis type="number" domain={[0, scheme.maxScore]} axisLine={false} tickLine={false} fontSize={11} />
                      <YAxis type="category" dataKey="name" width={110} axisLine={false} tickLine={false} fontSize={10} />
                      <Tooltip formatter={(v) => [Number(v), 'មធ្យមភាគ']} />
                      <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                        {data.subjects.map((s, i) => (
                          <Cell
                            key={i}
                            fill={s.avg < scheme.passMark
                              ? 'var(--color-danger)'
                              : s.avg < scheme.maxScore * 0.7
                                ? 'var(--color-warning)'
                                : 'var(--color-success)'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* ------------------------------------------- top / bottom */}
              <section className="grid gap-4 sm:grid-cols-2">
                <RankList
                  title="សិស្សពូកែ ៥ នាក់"
                  icon={<Trophy className="h-4 w-4 text-gold" aria-hidden="true" />}
                  students={data.top}
                  scheme={scheme}
                />
                <RankList
                  title="សិស្សត្រូវការជំនួយ ៥ នាក់"
                  icon={<AlertTriangle className="h-4 w-4 text-danger" aria-hidden="true" />}
                  students={data.bottom}
                  scheme={scheme}
                />
              </section>

              {/* ------------------------------------------------- trend */}
              {data.trend.length > 1 && (
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-text-heading">
                    <TrendingUp className="h-4 w-4 text-success" aria-hidden="true" />
                    មធ្យមភាគថ្នាក់តាមខែ
                  </h3>
                  <div className="h-52 rounded-xl border border-divider p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.trend}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--divider)" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={11} />
                        <YAxis domain={[0, scheme.maxScore]} axisLine={false} tickLine={false} fontSize={11} />
                        <Tooltip formatter={(v) => [Number(v), 'មធ្យមភាគ']} />
                        <Line
                          type="monotone"
                          dataKey="avg"
                          stroke="var(--brand)"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: 'var(--brand)' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-divider px-5 py-3">
          <Link
            href="/score-analyse"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-brand hover:underline"
          >
            វិភាគទិន្នន័យលម្អិត <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function RankList({
  title,
  icon,
  students,
  scheme = DEFAULT_SCHEME_CONFIG,
}: {
  title: string
  icon: React.ReactNode
  students: TotalledStudent[]
  scheme?: GradingSchemeConfig
}) {
  return (
    <div className="rounded-xl border border-divider p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-text-heading">{icon}{title}</h3>
      <ol className="flex flex-col gap-1.5">
        {students.map((s, i) => {
          const avg = s.finalAverageForRank
          return (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="w-4 shrink-0 text-xs text-text-muted tabular-nums">{toKhmerNumber(i + 1)}.</span>
              <Link
                href={`/students/${s.id}`}
                className="min-w-0 flex-1 truncate font-bold text-text-heading hover:text-brand hover:underline"
              >
                {s.name_kh || s.name_en}
              </Link>
              <span className={`rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums ${styleFor(avg, scheme).pill}`}>
                {formatMark(avg)} {letterOrDash(avg, scheme)}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default ScoreAnalyticsPanel
