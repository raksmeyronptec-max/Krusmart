'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useActiveClass } from '@/lib/hooks/useActiveClass'
import { useAcademicYear } from '@/lib/hooks/useAcademicYear'
import { useSchoolContext } from '@/lib/context/SchoolContext'
import { resolveCalendar, type ScorePeriod } from '@/lib/scores/calendar'
import type { ScoreCalendarPeriodRow } from '@/lib/types'
import { logger } from '@/lib/utils/logger'

// Only hex and dashes may reach a PostgREST `or=` string — the same guard
// `lib/utils/serverScope.ts` applies at its own `.or()` call site.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The score-period calendar the active class runs on.
 *
 * Modelled on `useScoreTemplate`: waits for the class context so the common
 * case is one fetch, holds the raw rows so a reload after an edit is one
 * round trip, and falls back to `DEFAULT_CALENDAR` whenever rows have not
 * arrived — during the first render, for a legacy account with no class and
 * no school, and on a database where migration 00029 has not been applied.
 * All of those render exactly today's twelve months (INV-2), so a screen on
 * this hook is never blank and never half a calendar.
 *
 * Reads the table with the browser client the way `SchoolContext` does — RLS
 * is the boundary either way, and `resolveCalendar` picks the winning layer
 * (class rows → school rows → default, each as a whole set, INV-3).
 *
 * The year is `useAcademicYear().academicYearName` — the label string the
 * calendar and `scores.score_period` both key on, never the year row's UUID.
 */
export function useScoreCalendar(): {
  /** The resolved calendar — twelve default periods until configured otherwise. */
  calendar: ScorePeriod[]
  /** Raw rows for the target and year. Empty means "not configured". */
  rows: ScoreCalendarPeriodRow[]
  /** True when the class (or its school) has stored its own calendar. */
  configured: boolean
  /** The academic-year label the calendar was resolved for, e.g. `'2025-2026'`. */
  academicYear: string
  loading: boolean
  reload: () => Promise<void>
} {
  const supabase = useMemo(() => createClient(), [])
  const { classId, loading: classLoading } = useActiveClass()
  const school = useSchoolContext()
  const { academicYearName, loading: yearLoading } = useAcademicYear()

  const schoolId = school?.school?.id ?? null
  const schoolLoading = school?.loading ?? false

  const [rows, setRows] = useState<ScoreCalendarPeriodRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRows = useCallback(async (): Promise<ScoreCalendarPeriodRow[]> => {
    // RLS restricts what comes back; the explicit target filter is the usual
    // second guard and keeps the payload to rows this class can resolve. With
    // neither a school nor a class — a pre-V2 account — there is nothing to
    // ask for, and the default resolves without a request.
    const filters: string[] = []
    if (classId !== null && UUID.test(classId)) filters.push(`class_id.eq.${classId}`)
    if (schoolId !== null && UUID.test(schoolId)) filters.push(`school_id.eq.${schoolId}`)
    if (filters.length === 0) return []

    const { data, error } = await supabase
      .from('score_calendar_periods')
      .select('*')
      .or(filters.join(','))
      .eq('academic_year', academicYearName)
      .order('sort_order', { ascending: true })
    if (error) {
      // A missing table (00029 not applied) lands here too — the default
      // calendar is today's behaviour, so nothing visibly breaks.
      logger.error(error)
      return []
    }
    return (data ?? []) as ScoreCalendarPeriodRow[]
  }, [supabase, classId, schoolId, academicYearName])

  const reload = useCallback(async () => {
    setRows(await fetchRows())
  }, [fetchRows])

  useEffect(() => {
    // Wait for the contexts: fetching first with no class and again with one
    // would issue two requests to resolve the same calendar in the common
    // case. The default covers the interval, so nothing is blank meanwhile.
    if (classLoading || schoolLoading || yearLoading) return

    let cancelled = false

    const run = async () => {
      try {
        const fetched = await fetchRows()
        if (!cancelled) setRows(fetched)
      } catch (e) {
        logger.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [classLoading, schoolLoading, yearLoading, fetchRows])

  const calendar = useMemo(
    () => resolveCalendar(rows, { classId: classId ?? undefined, academicYear: academicYearName }),
    [rows, classId, academicYearName],
  )

  // Any row for the target means a layer is configured — the filter already
  // narrowed to this class and its school.
  const configured = rows.length > 0

  return {
    calendar,
    rows,
    configured,
    academicYear: academicYearName,
    loading: loading || classLoading || schoolLoading || yearLoading,
    reload,
  }
}
