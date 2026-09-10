'use client'

import { useTeacherContext } from '@/lib/context/TeacherContext'
import type { TeacherAssignmentDetail } from '@/lib/types'

export interface UseActiveClassResult {
  classId: string | null
  className: string
  /**
   * The class's grade, from `grades` on the assignment row.
   *
   * `null` whenever it genuinely cannot be resolved — a legacy account, or a
   * teacher whose `current_school_ids()` does not cover the class's school, so
   * `grades_select_member` (00003) returns no row. Surfaces must print an
   * honest dash rather than deriving a number from `className`, which is free
   * text by the time it reaches here.
   */
  gradeName: string | null
  /** `grades.sort_order` — the grade number, 1–12, or `null` when unresolved. */
  gradeNumber: number | null
  /** The academic year the active assignment belongs to (`'2026-2027'`). */
  academicYearName: string
  subjectId: string | null
  subjectName: string | null
  assignment: TeacherAssignmentDetail | null
  assignments: TeacherAssignmentDetail[]
  setAssignmentId: (id: string) => void
  hasMultiple: boolean
  /** No assignments exist — callers must use the legacy teacher_id path. */
  isLegacy: boolean
  loading: boolean
}

/**
 * The class (and optional subject) the teacher is currently working in.
 *
 * Replaces the Firestore-era `currentClassId` localStorage key: selection is
 * session state so two tabs cannot disagree about which class is being edited.
 */
export function useActiveClass(): UseActiveClassResult {
  const teacher = useTeacherContext()

  return {
    classId: teacher?.activeClassId ?? null,
    className: teacher?.activeAssignment?.class_name ?? '',
    gradeName: teacher?.activeAssignment?.grade_name ?? null,
    gradeNumber: teacher?.activeAssignment?.grade_number ?? null,
    academicYearName: teacher?.activeAssignment?.academic_year_name ?? '',
    subjectId: teacher?.activeSubjectId ?? null,
    subjectName: teacher?.activeAssignment?.subject_name ?? null,
    assignment: teacher?.activeAssignment ?? null,
    assignments: teacher?.assignments ?? [],
    setAssignmentId: teacher?.setActiveAssignmentId ?? (() => {}),
    hasMultiple: teacher?.hasMultiple ?? false,
    isLegacy: teacher?.isLegacy ?? true,
    loading: teacher?.loading ?? false,
  }
}
