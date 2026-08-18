import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { QueryScope } from '@/lib/utils/queryFilter'
import { CLASS_PARAM } from './scopeParam'
import { logger } from '@/lib/utils/logger'
import {
  resolveTemplate,
  SYSTEM_PRIMARY_TEMPLATE,
  type EffectiveSubject,
  type TemplateContext,
  type TemplateScoreType,
} from '@/lib/scores/template'
import { EDUCATION_LEVELS } from '@/lib/onboarding/curriculum'
import type { ScoreTemplateSubjectRow, Student, TeacherAssignment } from '@/lib/types'

/**
 * Server-side counterpart to `lib/utils/queryFilter`.
 *
 * `TeacherContext` is client state, so a server component cannot read which
 * class is selected. The selection therefore travels in the URL as `?class=`,
 * which the switcher writes and this module reads — that keeps the server-
 * rendered data and the client context in agreement, and makes a class view
 * shareable and bookmarkable.
 *
 * The requested id is always validated against the caller's own assignments;
 * a forged `?class=` cannot widen access.
 */

export { CLASS_PARAM } from './scopeParam'

/**
 * Decide how to scope this request.
 *
 * Falls back to legacy `teacher_id` scoping whenever the teacher has no
 * assignments — which is every pre-V2 account — so untouched features keep
 * working exactly as before.
 */
export async function resolveServerScope(
  userId: string,
  requestedClassId?: string,
): Promise<QueryScope> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('teacher_assignments')
    .select('id, teacher_id, class_id, subject_id, academic_year_id, is_homeroom, status')
    .eq('teacher_id', userId)
    .eq('status', 'active')

  const assignments = (data ?? []) as TeacherAssignment[]
  if (assignments.length === 0) {
    return { mode: 'legacy', teacherId: userId }
  }

  // Honour the request only if the teacher actually holds that class.
  const requested = requestedClassId
    ? assignments.find((a) => a.class_id === requestedClassId)
    : undefined

  // Otherwise prefer the homeroom assignment, then the first.
  const chosen = requested ?? assignments.find((a) => a.is_homeroom) ?? assignments[0]

  return {
    mode: 'v2',
    teacherId: userId,
    classId: chosen.class_id,
    academicYearId: chosen.academic_year_id,
  }
}

/**
 * Read `?class=` out of a page's `searchParams`.
 * Next.js 16 passes `searchParams` as a promise.
 */
export async function classIdFromSearchParams(
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
): Promise<string | undefined> {
  if (!searchParams) return undefined
  const params = await searchParams
  const raw = params[CLASS_PARAM]
  return Array.isArray(raw) ? raw[0] : raw
}

/**
 * The roster for a scope, in the app's established display order.
 *
 * In v2 the roster comes from `student_enrollments`, not `students.teacher_id`:
 * that indirection is the point of the migration, since a student can sit in
 * different classes across years.
 *
 * Scoping differs by mode, on purpose:
 *
 *   legacy — `teacher_id` is the only boundary there is.
 *   v2     — the *class* is the boundary. `teacher_id` is deliberately NOT
 *            applied to this read: a subject teacher legitimately sees students
 *            another teacher created, and filtering on ownership would return an
 *            empty roster (migration 00006 widens the matching RLS policy).
 *            Writes keep the `teacher_id` guard — see `actions.ts`.
 */
export async function fetchStudentsForScope(scope: QueryScope): Promise<Student[]> {
  const supabase = await createClient()

  let query = supabase.from('students').select('*')

  if (scope.mode === 'legacy') {
    query = query.eq('teacher_id', scope.teacherId)
  }

  if (scope.mode === 'v2') {
    let enrolled = supabase
      .from('student_enrollments')
      .select('student_id')
    // Not `.eq('status','active')`: once a year ends, its enrolments are stamped
    // `promoted` or `transferred`, so filtering on active would make every past
    // class render an empty roster. Anyone who sat in the class that year counts;
    // only `withdrawn` is excluded.
      .eq('class_id', scope.classId)
      .neq('status', 'withdrawn')

    if (scope.academicYearId) {
      enrolled = enrolled.eq('academic_year_id', scope.academicYearId)
    }

    const { data: rows } = await enrolled
    const ids = (rows ?? []).map((r) => r.student_id)

    // No enrolments for this class means an empty roster, not "show everything".
    if (ids.length === 0) return []

    query = query.in('id', ids)
  }

  const { data } = await query
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  return (data ?? []) as Student[]
}

/**
 * Student ids making up the scope's roster, or `null` in legacy mode meaning
 * "there is no class — filter by `teacher_id` instead".
 *
 * Score reads use this rather than `teacher_id`: under migration 00007 a teacher
 * assigned to a class may read every subject's marks for it, including those a
 * colleague entered. Filtering on ownership would hide exactly those rows.
 */
export async function rosterIdsForScope(scope: QueryScope): Promise<string[] | null> {
  if (scope.mode === 'legacy') return null

  const supabase = await createClient()

  let q = supabase
    .from('student_enrollments')
    .select('student_id')
    .eq('class_id', scope.classId)
    // See fetchStudentsForScope: past years carry promoted/transferred rows.
    .neq('status', 'withdrawn')

  if (scope.academicYearId) q = q.eq('academic_year_id', scope.academicYearId)

  const { data } = await q
  return (data ?? []).map((r) => r.student_id)
}

/**
 * Students stranded outside the enrolment system: rows under this teacher's
 * `teacher_id` with **no `student_enrollments` row at all**.
 *
 * That absence is the exact signature of the onboarding gap migration 00018
 * closes (commit 2686507 created assignments without ever writing enrolments)
 * and of a failed enrol-compensation in `enrollment/actions.ts` — and it is
 * deliberately *not* "the roster looks empty": a student enrolled anywhere,
 * in any year, in any status, was placed by someone on purpose, and offering
 * to bulk-enrol them here would present a mass roster change (e.g. dragging
 * last year's class into a new year's) as a recovery of lost data.
 *
 * CONTRACT: this predicate must stay identical to the NOT EXISTS in
 * `backfill_teacher_enrolments` (migration 00019) — the banner's count is a
 * promise about what the button will do, and the two disagreeing is exactly
 * the defect 00019 fixed (the RPC's year-scoped guard silently promoted a
 * previous year's roster while the banner claimed a handful).
 *
 * Gated on an active homeroom assignment for the scope's class because
 * `backfill_teacher_enrolments` (the repair this count drives) only acts for
 * one — a subject-only teacher must not be offered a button that can never
 * succeed.
 */
export async function countRecoverableLegacyStudents(
  scope: QueryScope,
  userId: string,
): Promise<number> {
  if (scope.mode !== 'v2') return 0

  const supabase = await createClient()

  const { data: homeroom } = await supabase
    .from('teacher_assignments')
    .select('id')
    .eq('teacher_id', userId)
    .eq('class_id', scope.classId)
    .eq('is_homeroom', true)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (!homeroom) return 0

  const { data: owned } = await supabase
    .from('students')
    .select('id')
    .eq('teacher_id', userId)
  const ids = (owned ?? []).map((r) => r.id)
  if (ids.length === 0) return 0

  const { data: enrolledRows } = await supabase
    .from('student_enrollments')
    .select('student_id')
    .in('student_id', ids)
  const enrolled = new Set((enrolledRows ?? []).map((r) => r.student_id))

  return ids.filter((id) => !enrolled.has(id)).length
}

/**
 * Only hex and dashes reach a PostgREST `or=` string.
 *
 * The ids below come from `profiles` and from an assignment this teacher was
 * already proven to hold, so neither is user input — but `.or()` takes a
 * *string* filter expression, and the one place in this codebase that builds
 * one should not be the place that trusts its inputs.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Every score-template row that applies to a scope: the national default, the
 * caller's school, and their active class.
 *
 * Three layers in one request rather than three: `resolveTemplate()` needs them
 * together to decide which one wins per subject, and a classroom connection
 * should not pay for that three times.
 *
 * RLS already restricts what comes back; the explicit `school_id` / `class_id`
 * filters are the project's usual second guard, and they also keep the payload
 * to the rows this screen can actually use.
 */
export async function fetchScoreTemplateRows(
  scope: QueryScope,
): Promise<ScoreTemplateSubjectRow[]> {
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', scope.teacherId)
    .maybeSingle()

  const filters = ['scope.eq.system']
  const schoolId = profile?.school_id
  if (typeof schoolId === 'string' && UUID.test(schoolId)) {
    filters.push(`school_id.eq.${schoolId}`)
  }
  if (scope.mode === 'v2' && UUID.test(scope.classId)) {
    filters.push(`class_id.eq.${scope.classId}`)
  }

  const { data, error } = await supabase
    .from('score_template_subjects')
    .select('*')
    .or(filters.join(','))
    .order('sort_order', { ascending: true })

  if (error) {
    // A missing table (migration 00016 not yet applied) lands here too. The
    // caller falls back to the seeded default rather than rendering an empty
    // subject picker, which to a teacher looks like losing their subjects.
    logger.error(error)
    return []
  }

  return (data ?? []) as ScoreTemplateSubjectRow[]
}

/**
 * Which curriculum a class resolves against: education level, grade number,
 * and (grades 11–12) stream.
 *
 * The level is recovered by matching `education_levels.name` against the
 * canonical ladder in `lib/onboarding/curriculum.ts` — the strings 00004
 * backfilled and onboarding re-seeds verbatim, which that module documents as
 * an invariant. `grades.sort_order` carries the grade number under the same
 * contract. A school that invented its own level names simply resolves to no
 * level, and `filterRowsForContext` then falls back to the untagged rows —
 * today's behaviour, never an empty picker.
 *
 * `classes.track` arrives with 00021; on a database that has not run it, the
 * dedicated select fails and the track degrades to null, again the safe
 * direction (the row-level track filter only ever narrows).
 */
export async function resolveClassTemplateContext(
  classId: string,
): Promise<TemplateContext | null> {
  const supabase = await createClient()

  const { data: cls } = await supabase
    .from('classes')
    .select('grade_id, grade:grades(sort_order, education_level:education_levels(name))')
    .eq('id', classId)
    .maybeSingle()
  if (!cls) return null

  // PostgREST types embedded to-one relations as object-or-array.
  const one = <T,>(rel: T | T[] | null | undefined): T | undefined =>
    Array.isArray(rel) ? rel[0] : (rel ?? undefined)

  const grade = one(cls.grade as { sort_order?: number | null; education_level?: unknown } | null)
  const levelName = one(grade?.education_level as { name?: string } | { name?: string }[] | null)?.name
  const levelKey = EDUCATION_LEVELS.find((l) => l.name === levelName)?.key ?? null
  const gradeNumber =
    typeof grade?.sort_order === 'number' && grade.sort_order >= 1 && grade.sort_order <= 12
      ? grade.sort_order
      : null

  // Separate select so a pre-00021 database (no `track` column → 42703) costs
  // the track, not the whole context.
  let track: TemplateContext['track'] = null
  const { data: trackRow, error: trackErr } = await supabase
    .from('classes')
    .select('track')
    .eq('id', classId)
    .maybeSingle()
  if (!trackErr) {
    const raw = (trackRow as { track?: string | null } | null)?.track
    track = raw === 'science' || raw === 'social_science' ? raw : null
  }

  return { levelKey, gradeNumber, track }
}

/** Rows plus the context they should be resolved under, in one call. */
export async function fetchScoreTemplate(
  scope: QueryScope,
): Promise<{ rows: ScoreTemplateSubjectRow[]; context: TemplateContext | null }> {
  const rows = await fetchScoreTemplateRows(scope)
  const context = scope.mode === 'v2' ? await resolveClassTemplateContext(scope.classId) : null
  return { rows, context }
}

/**
 * The subjects a server-rendered screen should offer, for one score type.
 *
 * Built on `resolveServerScope`, deliberately: the class selection travels in
 * `?class=` and is validated there, and this must not become a second way of
 * deciding which class a request is about.
 *
 * Falls back to `SYSTEM_PRIMARY_TEMPLATE` when the query returns nothing — a
 * legacy account, a database where 00016 has not run, or a failed request all
 * end up showing exactly the list the app shipped with.
 */
export async function resolveServerTemplate(
  userId: string,
  requestedClassId: string | undefined,
  scoreType: TemplateScoreType,
): Promise<EffectiveSubject[]> {
  const scope = await resolveServerScope(userId, requestedClassId)
  const { rows, context } = await fetchScoreTemplate(scope)
  return resolveTemplate(rows.length > 0 ? rows : SYSTEM_PRIMARY_TEMPLATE, scoreType, context)
}
