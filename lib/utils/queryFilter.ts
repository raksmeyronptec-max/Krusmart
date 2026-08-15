/**
 * Bridge between the legacy single-teacher query path and the V2 class-scoped one.
 *
 * Phase 5 migrates features one at a time, so both paths must work at once:
 *
 *   legacy — `.eq('teacher_id', userId)`; a class *is* a teacher account.
 *   v2     — scope by `class_id` + `academic_year_id`, still keeping `teacher_id`
 *            as a second filter (defence in depth, per the project convention).
 *
 * The mode is chosen by data, not by a flag: a teacher with no
 * `teacher_assignments` row is still on the legacy path and must keep working.
 */

import type { PostgrestFilterBuilder } from '@supabase/postgrest-js'

/** The subset of teacher context this module needs. Structural, so both the
 *  client context object and a server-resolved equivalent satisfy it. */
export interface ScopeContext {
  activeClassId?: string | null
  activeAcademicYearId?: string | null
  isLegacy?: boolean
}

export type QueryScope =
  | { mode: 'legacy'; teacherId: string }
  | { mode: 'v2'; teacherId: string; classId: string; academicYearId: string | null }

/**
 * Decide how to scope a query for this user.
 *
 * Falls back to legacy whenever the context is absent, still loading, or has no
 * active class — the safe direction, since legacy scoping is strictly narrower.
 */
export function resolveScope(context: ScopeContext | null | undefined, userId: string): QueryScope {
  if (context && !context.isLegacy && context.activeClassId) {
    return {
      mode: 'v2',
      teacherId: userId,
      classId: context.activeClassId,
      academicYearId: context.activeAcademicYearId ?? null,
    }
  }
  return { mode: 'legacy', teacherId: userId }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgrestFilterBuilder's
   four generics vary per table; constraining them here would force every caller
   to restate its row type. The builder is returned unchanged, so callers keep
   their own inference. */
type AnyFilter = PostgrestFilterBuilder<any, any, any, any, any>
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Apply `scope` to a Supabase query.
 *
 * `teacher_id` is applied in *both* modes: RLS already enforces it, and the
 * project treats the explicit filter as a second guard.
 *
 * ```ts
 * const { data } = await applyScope(
 *   supabase.from('scores').select('*'), scope
 * ).eq('score_type', 'monthly')
 * ```
 */
export function applyScope<Q extends AnyFilter>(query: Q, scope: QueryScope): Q {
  let q = query.eq('teacher_id', scope.teacherId) as Q

  if (scope.mode === 'v2') {
    q = q.eq('class_id', scope.classId) as Q
    if (scope.academicYearId) {
      q = q.eq('academic_year_id', scope.academicYearId) as Q
    }
  }

  return q
}

/**
 * Columns to stamp onto a row being written, so new records join the V2
 * structure immediately while legacy writes stay exactly as they were.
 */
export function scopeColumns(scope: QueryScope): Record<string, string> {
  if (scope.mode === 'legacy') {
    return { teacher_id: scope.teacherId }
  }
  return {
    teacher_id: scope.teacherId,
    class_id: scope.classId,
    ...(scope.academicYearId ? { academic_year_id: scope.academicYearId } : {}),
  }
}

/**
 * Students belonging to a scope.
 *
 * In v2 the roster comes from `student_enrollments`, not `students.teacher_id` —
 * that indirection is the whole point of the migration, since a student can be
 * enrolled in different classes across years.
 *
 * Returns the id list to filter on, or `null` in legacy mode meaning "use
 * `teacher_id` directly".
 */
export async function resolveStudentIds(
  supabase: { from: (t: string) => AnyFilter },
  scope: QueryScope,
): Promise<string[] | null> {
  if (scope.mode === 'legacy') return null

  let q = supabase.from('student_enrollments').select('student_id').eq('class_id', scope.classId)
  if (scope.academicYearId) q = q.eq('academic_year_id', scope.academicYearId)

  const { data } = await q.eq('status', 'active')
  return ((data ?? []) as { student_id: string }[]).map((r) => r.student_id)
}
