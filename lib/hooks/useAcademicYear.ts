'use client'

import { useSchoolContext } from '@/lib/context/SchoolContext'
import { useTeacherContext } from '@/lib/context/TeacherContext'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import type { AcademicYear } from '@/lib/types'

export interface UseAcademicYearResult {
  /** Row for the selected year, or null on a pre-V2 account. */
  academicYear: AcademicYear | null
  /** Always usable: the row's name, else the computed current year. */
  academicYearName: string
  academicYearId: string | null
  options: AcademicYear[]
  setAcademicYearId: (id: string) => void
  loading: boolean
}

/**
 * The academic year every scoped query should filter on.
 *
 * Resolution order: the teacher's active assignment → the school's active year →
 * the year computed from today's date. The last step is what lets a pre-V2
 * account, which has neither, keep rendering.
 */
export function useAcademicYear(): UseAcademicYearResult {
  const school = useSchoolContext()
  const teacher = useTeacherContext()

  const options = school?.academicYears ?? []
  const fromAssignment = teacher?.activeAcademicYearId
    ? options.find((y) => y.id === teacher.activeAcademicYearId)
    : undefined

  const academicYear = fromAssignment ?? school?.activeAcademicYear ?? null

  return {
    academicYear,
    academicYearName: academicYear?.name ?? getCurrentAcademicYear(),
    academicYearId: academicYear?.id ?? null,
    options,
    setAcademicYearId: school?.setActiveAcademicYearId ?? (() => {}),
    loading: Boolean(school?.loading || teacher?.loading),
  }
}
