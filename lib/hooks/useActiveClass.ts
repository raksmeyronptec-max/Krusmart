'use client'

import { useTeacherContext } from '@/lib/context/TeacherContext'
import type { TeacherAssignmentDetail } from '@/lib/types'

export interface UseActiveClassResult {
  classId: string | null
  className: string
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
