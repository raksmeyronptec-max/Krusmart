'use client'

import { CalendarCheck, CheckCircle2, XCircle, Clock, FileText } from 'lucide-react'
import { PortalHeader, EmptyState } from '../../PortalHeader'
import { useParent } from '../../ParentContext'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { AttendanceRecord } from '@/lib/types'
import type { AttendanceSummary } from '../../queries'

const STATUS = {
  P:  { key: 'present'    as const, tone: 'text-emerald-400', bg: 'bg-emerald-400/10', Icon: CheckCircle2 },
  L:  { key: 'late'       as const, tone: 'text-amber-400',   bg: 'bg-amber-400/10',   Icon: Clock },
  A:  { key: 'absent'     as const, tone: 'text-rose-400',    bg: 'bg-rose-400/10',    Icon: XCircle },
  AP: { key: 'permission' as const, tone: 'text-blue-400',    bg: 'bg-blue-400/10',    Icon: FileText },
}

export default function AttendanceClient({
  records, summary, childName,
}: {
  records: AttendanceRecord[]
  summary: AttendanceSummary
  childName: string
}) {
  const { t } = useParent()

  // Spread first so STATUS's own `key` is not clobbered by the literal.
  const tiles = [
    { ...STATUS.P,  value: summary.present },
    { ...STATUS.L,  value: summary.late },
    { ...STATUS.A,  value: summary.absent },
    { ...STATUS.AP, value: summary.permission },
  ]

  return (
    <>
      <PortalHeader titleKey="attendance_title" subtitle={childName} />

      <section className="px-4 py-6">
        <div className="mb-4 rounded-2xl border bg-card-dark p-5 text-center" style={{ borderColor: 'var(--pp-card-border)' }}>
          <p className="text-sm text-pp-muted">{t('attendance_rate')}</p>
          <p className="mt-1 text-4xl font-bold" style={{ color: 'var(--pp-accent)' }}>
            {summary.rate === null ? '—' : `${toKhmerNumber(summary.rate)}%`}
          </p>
          <p className="mt-1 text-xs text-pp-muted">
            {t('total_days')}: {toKhmerNumber(summary.total)}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3">
          {tiles.map((tile) => (
            <div key={tile.key} className="rounded-2xl border bg-card-dark p-4" style={{ borderColor: 'var(--pp-card-border)' }}>
              <span className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg ${tile.bg}`}>
                <tile.Icon className={`h-5 w-5 ${tile.tone}`} aria-hidden="true" />
              </span>
              <p className="text-xs text-pp-muted">{t(tile.key)}</p>
              <p className="text-xl font-bold text-pp">{toKhmerNumber(tile.value)}</p>
            </div>
          ))}
        </div>

        {records.length === 0 ? (
          <EmptyState messageKey="no_attendance" icon={<CalendarCheck className="h-10 w-10" />} />
        ) : (
          <ul className="space-y-2">
            {records.map((r) => {
              const s = STATUS[r.status as keyof typeof STATUS] ?? STATUS.P
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card-dark p-3"
                  style={{ borderColor: 'var(--pp-card-border)' }}
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.bg}`}>
                      <s.Icon className={`h-5 w-5 ${s.tone}`} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-pp">
                        {new Date(r.date).toLocaleDateString('km-KH', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                      {r.reason && <p className="text-xs text-pp-muted">{r.reason}</p>}
                    </div>
                  </div>
                  <span className={`text-xs font-bold ${s.tone}`}>{t(s.key)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
