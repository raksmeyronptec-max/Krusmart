'use client'

import { CalendarDays, ChevronLeft, ChevronRight, Clock, Sun } from 'lucide-react'
import Select from '@/components/ui/forms/Select'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { MONTHS_BY_ACADEMIC_YEAR } from '@/lib/constants/months'
import { khmerWeekday } from '@/lib/constants/weekdays'
import { isSameDate, type HomeworkDay } from './period'

/**
 * Which cycle, and which day of it.
 *
 * Year and month replace the loaded period, so they go through the caller's
 * unsaved-changes guard; the day does not — it only changes which column of the
 * already-loaded period is on screen, so it switches instantly.
 *
 * The day picker carries a previous/next pair as well as the list. A teacher
 * catching up on three missed days should not have to open a dropdown three
 * times, and stepping is the one motion a thumb can do without looking.
 */

export interface HomeworkPeriodControlsProps {
  academicYear: string
  onAcademicYearChange: (value: string) => void
  academicYearOptions: { value: string; label: string }[]
  monthId: string
  onMonthChange: (value: string) => void
  /** Daily mode only. */
  showDayPicker: boolean
  days: HomeworkDay[]
  selectedDay: number
  onDayChange: (day: number) => void
  today?: Date
}

export function HomeworkPeriodControls({
  academicYear,
  onAcademicYearChange,
  academicYearOptions,
  monthId,
  onMonthChange,
  showDayPicker,
  days,
  selectedDay,
  onDayChange,
  today = new Date(),
}: HomeworkPeriodControlsProps) {
  const index = days.findIndex((d) => d.dayNum === selectedDay)
  const current = index >= 0 ? days[index] : undefined
  const todayInCycle = days.find((d) => isSameDate(d.date, today))

  const dayOptions = days.map((d) => {
    const marks = [khmerWeekday(d.date).replace('ថ្ងៃ', '')]
    if (d.isSunday) marks.push('ឈប់')
    if (todayInCycle?.dayNum === d.dayNum) marks.push('ថ្ងៃនេះ')
    return {
      value: String(d.dayNum),
      label: `ថ្ងៃទី ${toKhmerNumber(d.dayNum)} · ${marks.join(' · ')}`,
    }
  })

  const step = (delta: number) => {
    const next = days[index + delta]
    if (next) onDayChange(next.dayNum)
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Select
        label="ឆ្នាំសិក្សា"
        value={academicYear}
        onChange={onAcademicYearChange}
        options={academicYearOptions}
        leadingIcon={<CalendarDays />}
      />

      <Select
        label="ខែ"
        value={monthId}
        onChange={onMonthChange}
        options={MONTHS_BY_ACADEMIC_YEAR.map((m) => ({
          value: m.id,
          label: `ខែ${m.label} ឆ្នាំ ${m.isNextYear ? academicYear.split('-')[1] : academicYear.split('-')[0]}`,
        }))}
        leadingIcon={<Clock />}
      />

      {showDayPicker && (
        <div className="flex flex-col xl:col-span-2">
          <span className="mb-1 text-[13px] font-bold text-text-body" id="hw-day-label">
            ថ្ងៃដែលកំពុងបញ្ចូល
          </span>
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={index <= 0}
              aria-label="ថ្ងៃមុន"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-divider bg-bg-surface text-text-body transition hover:border-brand-400 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>

            <Select
              ariaLabel="ថ្ងៃដែលកំពុងបញ្ចូល"
              value={String(selectedDay)}
              onChange={(v) => onDayChange(Number(v))}
              options={dayOptions}
              wrapperClassName="min-w-0 flex-1"
            />

            <button
              type="button"
              onClick={() => step(1)}
              disabled={index < 0 || index >= days.length - 1}
              aria-label="ថ្ងៃបន្ទាប់"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-divider bg-bg-surface text-text-body transition hover:border-brand-400 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
            {current && (
              <span className="font-bold text-text-body">
                {khmerWeekday(current.date)} ទី {toKhmerNumber(current.dayNum)}
              </span>
            )}
            {current?.isSunday && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 font-bold text-danger">
                <Sun className="h-3 w-3" aria-hidden="true" /> ថ្ងៃឈប់សម្រាក
              </span>
            )}
            {todayInCycle && todayInCycle.dayNum !== selectedDay && (
              <button
                type="button"
                onClick={() => onDayChange(todayInCycle.dayNum)}
                className="rounded-full border border-brand-400 px-2 py-0.5 font-bold text-brand transition hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring dark:hover:bg-brand-900/40"
              >
                ទៅថ្ងៃនេះ
              </button>
            )}
          </p>
        </div>
      )}
    </div>
  )
}

export default HomeworkPeriodControls
