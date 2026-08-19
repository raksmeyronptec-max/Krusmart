'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserRoles, requirePermission } from '@/lib/rbac/server'
import { isSchoolAdmin } from '@/lib/rbac/permissions'
import { auditLog } from '@/lib/audit/log'
import { logger } from '@/lib/utils/logger'
import { getErrorMessageOr } from '@/lib/utils/errors'
import {
  fetchScoreTemplate, resolveServerScope, rosterIdsForScope,
} from '@/lib/utils/serverScope'
import {
  filterRowsForContext, resolveTemplate, SYSTEM_PRIMARY_TEMPLATE,
  type TemplateScoreType,
} from '@/lib/scores/template'
import type { ActionResult, Score } from '@/lib/types'

/**
 * ការប្រមូលពិន្ទុ — who has entered what, for one class and one period.
 *
 * The secondary model splits one class's marks across several teachers, so the
 * homeroom teacher needs a view of *completion* without the ability to edit
 * anybody else's subject. That separation is the point, not a limitation: the
 * write policy on `scores` is owner-only and stays that way, so this module
 * reads marks and never writes them.
 */

/** One subject's completion state for the class. */
export interface SubjectCompletion {
  subjectKey: string
  label: string
  /** Distinct pupils carrying at least one mark in this subject. */
  entered: number
  /** Roster size — the denominator. */
  total: number
  status: 'complete' | 'partial' | 'empty'
  /** Teachers assigned to this subject here. Empty is the failure mode. */
  teachers: { id: string; name: string }[]
  /** Teachers who have actually entered a mark, assigned or not. */
  contributors: { id: string; name: string }[]
}

export interface CollectionOverview {
  classId: string | null
  /** Whether the caller may assign teachers — the server-side admin truth. */
  canAssign: boolean
  /** Whether the caller covers the whole class (homeroom / primary / legacy). */
  isHomeroom: boolean
  subjects: SubjectCompletion[]
  rosterSize: number
}

const EMPTY: CollectionOverview = {
  classId: null, canAssign: false, isHomeroom: false, subjects: [], rosterSize: 0,
}

/**
 * Assemble the overview.
 *
 * Six round trips regardless of how many subjects or pupils the class holds:
 * scope, template, roster, assignments, roles, then one scores read and one
 * profiles read. Nothing is resolved per subject or per pupil.
 */
export async function getCollectionOverview(
  scoreType: TemplateScoreType,
  scorePeriod: string,
  classId?: string,
): Promise<CollectionOverview> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return EMPTY

  const scope = await resolveServerScope(user.id, classId)
  // Collection is a class-level view; a legacy account has no class to collect.
  if (scope.mode !== 'v2') return EMPTY

  const [{ rows, context }, rosterIds, assignmentsRes, ctx] = await Promise.all([
    fetchScoreTemplate(scope),
    rosterIdsForScope(scope),
    supabase
      .from('teacher_assignments')
      .select('teacher_id, subject_key, is_homeroom')
      .eq('class_id', scope.classId)
      .eq('status', 'active'),
    getUserRoles(),
  ])

  const ids = rosterIds ?? []
  const source = rows.length > 0 ? filterRowsForContext(rows, context) : SYSTEM_PRIMARY_TEMPLATE
  const subjects = resolveTemplate(source, scoreType, context)

  // One scores read for the whole class and period.
  //
  // Roster-scoped, not owner-scoped: this screen exists precisely to show the
  // marks other teachers entered. Migration 00007's
  // `scores_select_own_or_assigned` is the boundary that decides what comes
  // back, and it already grants exactly this.
  const scoresRes = ids.length
    ? await supabase
        .from('scores')
        .select('student_id, subject, teacher_id, score_value, score_text')
        .eq('score_type', scoreType)
        .eq('score_period', scorePeriod)
        .in('student_id', ids)
    : { data: [] as Score[], error: null }

  if (scoresRes.error) logger.error(scoresRes.error)
  const scoreRows = (scoresRes.data ?? []) as Score[]
  const assignments = assignmentsRes.data ?? []

  const teacherIds = [...new Set([
    ...assignments.map((a) => a.teacher_id as string),
    ...scoreRows.map((r) => r.teacher_id),
  ])].filter(Boolean)

  const names = new Map<string, string>()
  if (teacherIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', teacherIds)
    for (const p of profiles ?? []) {
      names.set(p.id as string, (p.full_name as string | null) || 'គ្រូបង្រៀន')
    }
  }
  const nameOf = (id: string) => ({ id, name: names.get(id) ?? 'គ្រូបង្រៀន' })

  // Marks indexed by column id, so a multi-column subject counts a pupil once.
  const byColumn = new Map<string, { pupils: Set<string>; teachers: Set<string> }>()
  for (const row of scoreRows) {
    const marked = (row.score_value !== null && row.score_value !== undefined)
      || (typeof row.score_text === 'string' && row.score_text !== '')
    if (!marked) continue
    const bucket = byColumn.get(row.subject) ?? { pupils: new Set<string>(), teachers: new Set<string>() }
    bucket.pupils.add(row.student_id)
    if (row.teacher_id) bucket.teachers.add(row.teacher_id)
    byColumn.set(row.subject, bucket)
  }

  const completion: SubjectCompletion[] = subjects.map((subject) => {
    const pupils = new Set<string>()
    const contributors = new Set<string>()
    for (const col of subject.columns) {
      const bucket = byColumn.get(col.id)
      if (!bucket) continue
      bucket.pupils.forEach((p) => pupils.add(p))
      bucket.teachers.forEach((t) => contributors.add(t))
    }

    const entered = pupils.size
    return {
      subjectKey: subject.subjectKey,
      label: subject.labelKm,
      entered,
      total: ids.length,
      status: entered === 0 ? 'empty' : entered >= ids.length ? 'complete' : 'partial',
      teachers: assignments
        .filter((a) => a.subject_key === subject.subjectKey)
        .map((a) => nameOf(a.teacher_id as string)),
      contributors: [...contributors].map(nameOf),
    }
  })

  // Whole-class when the caller holds a homeroom row — or none at all, which
  // is every primary and legacy account.
  const mine = assignments.filter((a) => a.teacher_id === user.id)
  const isHomeroom = mine.length === 0
    || mine.some((a) => a.is_homeroom === true || a.subject_key == null)

  return {
    classId: scope.classId,
    // The *server-side* role truth. `useUserRole().isAdmin` is deliberately
    // narrower — it excludes self-serve owners so sign-in routes them into the
    // teacher app — but a one-teacher school owns its school and must be able
    // to assign itself, which is exactly what `is_school_admin()` grants in the
    // database. No new permission is invented here.
    canAssign: isSchoolAdmin(ctx?.roles ?? []),
    isHomeroom,
    subjects: completion,
    rosterSize: ids.length,
  }
}

/** Teachers who could be assigned — the school's own members. */
export async function listAssignableTeachers(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const ctx = await getUserRoles()
  if (!ctx?.activeSchoolId) return []

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('school_id', ctx.activeSchoolId)
    .order('full_name')

  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string | null) || 'គ្រូបង្រៀន',
  }))
}

/**
 * Assign a teacher to one subject of one class.
 *
 * Goes through the existing `teacher_assignments_admin_write` policy — no new
 * permission. The subject key is validated against the class's *resolved*
 * template, which is the only thing that knows which template row applies to
 * this class and track; the column carries no FK precisely because no single
 * table could serve as its target.
 */
export async function assignSubjectTeacher(
  subjectKey: string,
  teacherId: string,
  scoreType: TemplateScoreType,
  classId?: string,
): Promise<ActionResult> {
  try {
    await requirePermission('teachers:update')

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'សូមចូលគណនីជាមុនសិន' }

    const scope = await resolveServerScope(user.id, classId)
    if (scope.mode !== 'v2') return { error: 'គណនីនេះមិនទាន់មានថ្នាក់រៀនទេ' }

    const { rows, context } = await fetchScoreTemplate(scope)
    const source = rows.length > 0 ? filterRowsForContext(rows, context) : SYSTEM_PRIMARY_TEMPLATE
    const known = resolveTemplate(source, scoreType, context)
    if (!known.some((s) => s.subjectKey === subjectKey)) {
      return { error: 'មុខវិជ្ជានេះមិនមានក្នុងកម្មវិធីសិក្សារបស់ថ្នាក់នេះទេ' }
    }

    const { error } = await supabase.from('teacher_assignments').insert({
      teacher_id: teacherId,
      class_id: scope.classId,
      academic_year_id: scope.academicYearId,
      subject_key: subjectKey,
      is_homeroom: false,
      status: 'active',
    })

    if (error) {
      // `teacher_assignments_subject_key_uniq` (00024).
      if (error.code === '23505') return { error: 'គ្រូនេះត្រូវបានចាត់តាំងរួចហើយ' }
      logger.error(error)
      return { error: error.message }
    }

    await auditLog({
      action: 'teacher_assignment.created',
      entityType: 'teacher_assignment',
      newValue: { teacher_id: teacherId, subject_key: subjectKey, class_id: scope.classId },
      actorId: user.id,
    })

    return { success: true }
  } catch (e) {
    logger.error(e)
    return { error: getErrorMessageOr(e, 'មិនអាចចាត់តាំងគ្រូបានទេ') }
  }
}
