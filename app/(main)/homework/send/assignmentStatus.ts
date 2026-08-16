/**
 * Where an assignment sits relative to today.
 *
 * Everything here is derived from `homework_assignments.due_date` and nothing
 * else. The table records no submissions, no receipts and no per-child state,
 * so there is no honest way to show "completed", "seen" or "delivered" — and a
 * teacher acting on a fabricated status is worse off than one acting on none.
 * Three buckets are all the data supports:
 *
 *   today    — due today
 *   upcoming — due later
 *   overdue  — the due date has passed
 *
 * `status` on the row is left alone: it is always `'active'` in practice, and
 * the parent portal's read does not filter on it, so treating it as a
 * draft/published switch would hide work from the teacher that parents can
 * still see.
 */

import { toKhmerNumber } from '@/lib/utils/khmer-num'

export type DueBucket = 'today' | 'upcoming' | 'overdue'

export interface DueInfo {
  bucket: DueBucket
  /** Whole days from today — negative once the due date has passed. */
  days: number
  /** Khmer phrase for the card and the filter chips. */
  label: string
}

/**
 * Parse a `YYYY-MM-DD` column into a *local* date.
 *
 * `new Date('2026-08-16')` is parsed as UTC midnight, which in a negative-offset
 * timezone renders as the 15th. `due_date` is a calendar date with no time, so
 * it is built from its parts instead and compared against local midnight.
 */
export function parseDueDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map((part) => parseInt(part, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Local midnight — the reference point every comparison here uses. */
export function startOfToday(now: Date = new Date()): Date {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return today
}

/** Whole days between two local midnights. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

export function dueInfo(dueDate: string | null | undefined, now: Date = new Date()): DueInfo | null {
  const due = parseDueDate(dueDate)
  if (!due) return null

  const days = daysBetween(startOfToday(now), due)

  if (days === 0) return { bucket: 'today', days, label: 'ផុតកំណត់ថ្ងៃនេះ' }
  if (days === 1) return { bucket: 'upcoming', days, label: 'ផុតកំណត់ស្អែក' }
  if (days > 1) return { bucket: 'upcoming', days, label: `នៅសល់ ${toKhmerNumber(days)} ថ្ងៃ` }
  if (days === -1) return { bucket: 'overdue', days, label: 'ហួសកំណត់ ១ ថ្ងៃ' }
  return { bucket: 'overdue', days, label: `ហួសកំណត់ ${toKhmerNumber(-days)} ថ្ងៃ` }
}

/** Order the buckets are presented in: what is due now comes first. */
export const BUCKET_ORDER: readonly DueBucket[] = ['today', 'upcoming', 'overdue']

export const BUCKET_LABELS: Record<DueBucket, string> = {
  today: 'ផុតកំណត់ថ្ងៃនេះ',
  upcoming: 'ជិតដល់កំណត់',
  overdue: 'ហួសកំណត់',
}

/** True when the date is strictly before today — the composer's past-date guard. */
export function isPastDate(value: string, now: Date = new Date()): boolean {
  const due = parseDueDate(value)
  if (!due) return false
  return daysBetween(startOfToday(now), due) < 0
}
