'use client'

import { CalendarRange, LayoutGrid, ListChecks, Users } from 'lucide-react'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { formatKhmerDate, toISODate } from '@/lib/utils/date'
import type { HomeworkDay } from './period'
import type { HomeworkProgress } from './scores'

/**
 * What the teacher is editing, said once at the top.
 *
 * The old header said "បញ្ចូលពិន្ទុកិច្ចការផ្ទះ ធ្វើសមកាលកម្មដោយស្វ័យប្រវត្តិ" and
 * footed the page with "រួចរាល់សម្រាប់ធ្វើសមកាលកម្ម" — neither of which was
 * true: nothing synchronises in the background, and marks are only written when
 * Save is pressed. Everything on this bar is now a fact the page can stand
 * behind: which class, which cycle, and how much of it is done.
 *
 * The class name comes from the app shell's own context. The switcher stays in
 * the top navigation; this is a read-out, not a second control.
 */

export interface HomeworkEntryHeaderProps {
  /** Khmer class name from the shell context; empty for a pre-V2 account. */
  className: string
  academicYearName: string
  /** Academic year the marks are filed under, e.g. `2025-2026`. */
  academicYear: string
  monthLabel: string
  days: HomeworkDay[]
  /** Roster completion for the selected day. */
  dayProgress: HomeworkProgress
  /** Roster completion across the whole cycle. */
  monthProgress: HomeworkProgress
  studentCount: number
  femaleCount: number
}

export function HomeworkEntryHeader({
  className,
  academicYearName,
  academicYear,
  monthLabel,
  days,
  dayProgress,
  monthProgress,
  studentCount,
  femaleCount,
}: HomeworkEntryHeaderProps) {
  const first = days[0]
  const last = days[days.length - 1]

  return (
    <section className="mb-4 rounded-xl border border-divider bg-bg-surface p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="kh-moul text-lg text-brand md:text-xl">បញ្ចូលពិន្ទុកិច្ចការផ្ទះ</h1>
          <p className="mt-1 text-sm text-text-muted">
            ពិន្ទុប្រចាំខែ{monthLabel} ឆ្នាំសិក្សា {academicYear}
          </p>
        </div>

        {/* Read-out of the shell's class context — never a second switcher. */}
        {className && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-brand-100 px-3 py-1.5 text-xs font-bold text-brand-800 dark:bg-brand-900/40 dark:text-brand-300">
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              ថ្នាក់ {className}
            </span>
            {academicYearName && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-paper px-3 py-1.5 text-xs font-bold text-text-body">
                <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
                {academicYearName}
              </span>
            )}
          </div>
        )}
      </div>

      {/*
        The 26th-to-25th rule, stated as the dates it actually resolves to. The
        old page explained the rule in prose and left the teacher to work out
        which fortnight of which month that made this one.
      */}
      {first && last && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg bg-paper px-3 py-2.5 text-xs leading-relaxed text-text-body">
          <CalendarRange className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <span>
            វដ្តកិច្ចការផ្ទះខែ{monthLabel}៖ <strong>{formatKhmerDate(toISODate(first.date))}</strong> ដល់{' '}
            <strong>{formatKhmerDate(toISODate(last.date))}</strong> (
            {toKhmerNumber(days.filter((d) => !d.isSunday).length)} ថ្ងៃធ្វើការ)
          </span>
        </p>
      )}

      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg bg-paper px-3 py-2.5">
          <Users className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-text-muted">ចំនួនសិស្ស</p>
            <p className="font-bold text-text-heading tabular-nums">
              {toKhmerNumber(studentCount)} នាក់
              <span className="ml-1.5 text-xs font-normal text-text-muted">
                (ស្រី {toKhmerNumber(femaleCount)})
              </span>
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-paper px-3 py-2.5">
          <div className="flex items-center gap-3">
            <ListChecks className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-text-muted">បានបញ្ចូលថ្ងៃនេះ</p>
              <p className="font-bold text-text-heading tabular-nums">
                {toKhmerNumber(dayProgress.scored)}/{toKhmerNumber(dayProgress.total)} នាក់
              </p>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-divider">
            <div
              className="h-full rounded-full bg-success transition-all duration-300"
              style={{ width: `${dayProgress.percent}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg bg-paper px-3 py-2.5">
          <div className="flex items-center gap-3">
            <CalendarRange className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-text-muted">បំពេញពេញវដ្ត</p>
              <p className="font-bold text-text-heading tabular-nums">
                {toKhmerNumber(monthProgress.percent)}%
                <span className="ml-1.5 text-xs font-normal text-text-muted">
                  ({toKhmerNumber(monthProgress.scored)}/{toKhmerNumber(monthProgress.total)} ប្រអប់)
                </span>
              </p>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-divider">
            <div
              className="h-full rounded-full bg-gold transition-all duration-300"
              style={{ width: `${monthProgress.percent}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

export default HomeworkEntryHeader
