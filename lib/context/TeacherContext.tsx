'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logger } from '@/lib/utils/logger'
import type { TeacherAssignmentDetail } from '@/lib/types'

interface TeacherContextValue {
  assignments: TeacherAssignmentDetail[]
  activeAssignment: TeacherAssignmentDetail | null
  activeClassId: string | null
  activeSubjectId: string | null
  activeAcademicYearId: string | null
  setActiveAssignmentId: (id: string) => void
  /** True when the teacher has more than one assignment — drives the switcher UI. */
  hasMultiple: boolean
  /**
   * True when this account predates V2 and has no assignments at all. Consumers
   * must fall back to `teacher_id`-scoped queries; see `lib/utils/queryFilter`.
   */
  isLegacy: boolean
  loading: boolean
  refresh: () => Promise<void>
}

const TeacherContext = createContext<TeacherContextValue | null>(null)

/** Row shape returned by the embedded select below. */
interface AssignmentRow {
  id: string
  teacher_id: string
  class_id: string
  subject_id: string | null
  academic_year_id: string
  is_homeroom: boolean
  status: string
  created_at?: string
  classes?: { name?: string } | { name?: string }[] | null
  subjects?: { name?: string } | { name?: string }[] | null
  academic_years?:
    | { name?: string; school_id?: string; schools?: { name?: string } | { name?: string }[] }
    | { name?: string; school_id?: string; schools?: { name?: string } | { name?: string }[] }[]
    | null
}

/** PostgREST returns an embedded to-one relation as either an object or a 1-element array. */
function one<T>(rel: T | T[] | null | undefined): T | undefined {
  return Array.isArray(rel) ? rel[0] : (rel ?? undefined)
}

/**
 * The teacher's class/subject assignments and which one is currently selected.
 *
 * The active selection lives in React state, not `localStorage` — the previous
 * app stored `currentClassId` locally, which meant two tabs silently disagreed
 * about which class was being edited.
 */
export function TeacherContextProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])

  const [assignments, setAssignments] = useState<TeacherAssignmentDetail[]>([])
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null)
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

      const { data, error } = await supabase
        .from('teacher_assignments')
        // Written as one literal, not a concatenation: supabase-js parses the
        // select string at the type level and loses the relations if it is built.
        .select('id, teacher_id, class_id, subject_id, academic_year_id, is_homeroom, status, created_at, classes(name), subjects(name), academic_years(name, school_id, schools(name))')
        .eq('teacher_id', user.id)
        .eq('status', 'active')

      if (error) {
        logger.error('Failed to load teacher assignments:', error)
        return
      }

      const detailed: TeacherAssignmentDetail[] = (data ?? []).map((raw) => {
        const row = raw as AssignmentRow
        const year = one(row.academic_years)
        return {
          id: row.id,
          teacher_id: row.teacher_id,
          class_id: row.class_id,
          subject_id: row.subject_id,
          academic_year_id: row.academic_year_id,
          is_homeroom: row.is_homeroom,
          status: row.status,
          created_at: row.created_at,
          class_name: one(row.classes)?.name ?? '',
          subject_name: one(row.subjects)?.name ?? null,
          academic_year_name: year?.name ?? '',
          school_id: year?.school_id ?? '',
          school_name: one(year?.schools)?.name ?? '',
        }
      })

      // Newest year first, then homeroom ahead of subject assignments.
      detailed.sort((a, b) => {
        const byYear = b.academic_year_name.localeCompare(a.academic_year_name)
        if (byYear !== 0) return byYear
        if (a.is_homeroom !== b.is_homeroom) return a.is_homeroom ? -1 : 1
        return a.class_name.localeCompare(b.class_name, 'km')
      })

      setAssignments(detailed)
      setActiveAssignmentId((prev) =>
        prev && detailed.some((d) => d.id === prev) ? prev : (detailed[0]?.id ?? null),
      )
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const value = useMemo<TeacherContextValue>(() => {
    const active = assignments.find((a) => a.id === activeAssignmentId) ?? null
    return {
      assignments,
      activeAssignment: active,
      activeClassId: active?.class_id ?? null,
      activeSubjectId: active?.subject_id ?? null,
      activeAcademicYearId: active?.academic_year_id ?? null,
      setActiveAssignmentId,
      hasMultiple: assignments.length > 1,
      isLegacy: !loading && assignments.length === 0,
      loading,
      refresh: load,
    }
  }, [assignments, activeAssignmentId, loading, load])

  return <TeacherContext.Provider value={value}>{children}</TeacherContext.Provider>
}

/** Returns `null` outside a provider, so unmigrated pages still render. */
export function useTeacherContext(): TeacherContextValue | null {
  return useContext(TeacherContext)
}
