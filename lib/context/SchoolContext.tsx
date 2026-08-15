'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/utils/logger'
import type { AcademicYear, School } from '@/lib/types'

interface SchoolContextValue {
  school: School | null
  academicYears: AcademicYear[]
  /** The year every scoped query should filter on. */
  activeAcademicYear: AcademicYear | null
  setActiveAcademicYearId: (id: string) => void
  loading: boolean
  refresh: () => Promise<void>
}

const SchoolContext = createContext<SchoolContextValue | null>(null)

/**
 * The signed-in user's school and its academic years.
 *
 * Deliberately holds no `localStorage`: the active year is per-session state, and
 * persisting it would silently pin a teacher to last year's data after rollover.
 *
 * Everything degrades quietly. A pre-V2 account has no school row, so `school`
 * stays null and consumers fall back to the legacy `teacher_id` query path via
 * `lib/utils/queryFilter`.
 */
export function SchoolContextProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])

  const [school, setSchool] = useState<School | null>(null)
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [activeAcademicYearId, setActiveAcademicYearId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      // getSession() reads the locally stored JWT; getUser() is a network
      // round-trip to Supabase on every page load. This runs in the (main)
      // layout, so getUser() here would hit the auth API for all ~26 features —
      // the exact free-tier rate-limiting that lib/supabase/middleware.ts avoids.
      // Safe because nothing is trusted from it: the id only scopes a query that
      // RLS scopes again server-side.
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('school_id')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile?.school_id) return

      const [{ data: schoolRow }, { data: years, error: yearsErr }] = await Promise.all([
        supabase.from('schools').select('*').eq('id', profile.school_id).maybeSingle(),
        supabase
          .from('academic_years')
          .select('*')
          .eq('school_id', profile.school_id)
          .order('name', { ascending: false }),
      ])

      if (yearsErr) logger.error('Failed to load academic years:', yearsErr)

      setSchool(schoolRow ?? null)
      setAcademicYears(years ?? [])
      // Prefer the year flagged active; otherwise the most recent by name.
      setActiveAcademicYearId((years?.find((y) => y.is_active) ?? years?.[0])?.id ?? null)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const value = useMemo<SchoolContextValue>(
    () => ({
      school,
      academicYears,
      activeAcademicYear: academicYears.find((y) => y.id === activeAcademicYearId) ?? null,
      setActiveAcademicYearId,
      loading,
      refresh: load,
    }),
    [school, academicYears, activeAcademicYearId, loading, load],
  )

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>
}

/**
 * Returns `null` outside a provider rather than throwing, so a page that has not
 * been migrated to the V2 layout still renders.
 */
export function useSchoolContext(): SchoolContextValue | null {
  return useContext(SchoolContext)
}
