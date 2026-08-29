'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'
import { logger } from '@/lib/utils/logger'
import { classContext } from './classContext'
import { getUserRoles } from '@/lib/rbac/server'
import { isSchoolAdmin } from '@/lib/rbac/permissions'
import {
  fetchScoreCalendar, resolveClassTeachingRole, resolveServerScope, rosterIdsForScope,
} from '@/lib/utils/serverScope'
import { deriveLabel, validateCalendar, type ScorePeriod } from '@/lib/scores/calendar'
import { MONTHS_BY_ACADEMIC_YEAR, isMonthId, type MonthId } from '@/lib/constants/months'
import type { ScoreCalendarPeriodRow, ActionResult } from '@/lib/types'

/**
 * Writing a class's score-period calendar — `score_calendar_periods` (00029).
 *
 * Two rules shape everything here:
 *
 * 1. **Whole set or nothing (INV-3).** A calendar is a partition of twelve
 *    months, so a save replaces every class row for the year in one pass —
 *    `validateCalendar` cannot vouch for half an override.
 *
 * 2. **Homeroom or admin only** — a product decision (see the rollout ledger):
 *    rewriting the calendar re-grades every pupil's semester average across
 *    every subject, including subjects taught by colleagues, so a subject
 *    teacher may read it but not change it. RLS (00029) still allows any
 *    assigned teacher to write — tightening it is a migration for another day;
 *    this gate is the enforced boundary until then, matching how
 *    `requirePermission` fronts RLS everywhere else.
 */

const ACADEMIC_INDEX: Record<string, number> = Object.fromEntries(
  MONTHS_BY_ACADEMIC_YEAR.map((m, i) => [m.id, i]),
)

const ACADEMIC_YEAR_RE = /^\d{4}-\d{4}$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** What the editor sends: `ScorePeriod` minus the derived/locked fields. */
interface CalendarPeriodInput {
  key: string
  members: string[]
  semester: 'sem1' | 'sem2'
  startsOn: string | null
  endsOn: string | null
}

const EDIT_DENIED =
  'មានតែគ្រូបន្ទុកថ្នាក់ ឬអ្នកគ្រប់គ្រងសាលាប៉ុណ្ណោះ ដែលអាចកែវគ្គពិន្ទុបាន — ' +
  'ការផ្លាស់ប្តូរវានឹងគណនាមធ្យមភាគឆមាសរបស់សិស្សទាំងអស់ឡើងវិញ គ្រប់មុខវិជ្ជា។'

/**
 * The write gate: `classContext`'s permission + scope resolution, then the
 * homeroom-or-admin rule on top. Fail-closed — a failed role read denies the
 * write; the read side of the screen is unaffected.
 */
async function calendarEditContext(
  classId?: string,
): Promise<{ userId: string; classId: string } | { error: string }> {
  const ctx = await classContext(classId)
  if ('error' in ctx) return { error: ctx.error }

  const roles = await getUserRoles()
  const admin = roles !== null && isSchoolAdmin(roles.roles)
  if (!admin) {
    const role = await resolveClassTeachingRole(ctx.userId, ctx.classId)
    if (!role.isHomeroom) return { error: EDIT_DENIED }
  }

  return { userId: ctx.userId, classId: ctx.classId }
}

/** May the caller edit this class's calendar? Drives the tab's read-only state. */
export async function getCalendarEditAccess(
  classId?: string,
): Promise<{ canEdit: boolean; reason?: string }> {
  const gate = await calendarEditContext(classId)
  return 'error' in gate ? { canEdit: false, reason: gate.error } : { canEdit: true }
}

/** Parse and normalise the posted periods, or explain what is wrong in Khmer. */
function periodsFromInput(
  input: CalendarPeriodInput[],
): { periods: ScorePeriod[] } | { error: string } {
  const periods: ScorePeriod[] = []

  for (const p of input) {
    const members = [...new Set(p.members)].filter(isMonthId)
    if (members.length === 0 || members.length !== p.members.length) {
      return { error: 'វគ្គមួយមានខែមិនត្រឹមត្រូវ' }
    }
    members.sort((a, b) => ACADEMIC_INDEX[a] - ACADEMIC_INDEX[b])

    // Rule 2 of §11.5: the anchor is ALWAYS the first member in academic-year
    // order. A payload that disagrees is not repaired silently — re-anchoring
    // moves marks, so it is refused.
    if (p.key !== members[0]) {
      return { error: 'ខែគោលនៃវគ្គត្រូវតែជាខែដំបូងតាមលំដាប់ឆ្នាំសិក្សា' }
    }
    if (p.semester !== 'sem1' && p.semester !== 'sem2') {
      return { error: 'ឆមាសមិនត្រឹមត្រូវ' }
    }
    for (const d of [p.startsOn, p.endsOn]) {
      if (d !== null && !ISO_DATE_RE.test(d)) return { error: 'ទ្រង់ទ្រាយកាលបរិច្ឆេទមិនត្រឹមត្រូវ' }
    }
    if (p.startsOn !== null && p.endsOn !== null && p.endsOn < p.startsOn) {
      return { error: 'កាលបរិច្ឆេទបញ្ចប់មុនកាលបរិច្ឆេទចាប់ផ្តើម' }
    }

    periods.push({
      key: members[0],
      labelKm: deriveLabel(members),
      members,
      semester: p.semester,
      startsOn: p.startsOn,
      endsOn: p.endsOn,
      locked: false,
      sortOrder: periods.length,
    })
  }

  periods.sort((a, b) => ACADEMIC_INDEX[a.key] - ACADEMIC_INDEX[b.key])
  periods.forEach((p, i) => { p.sortOrder = i })

  // ★ The real boundary (§11.3): the client validated before enabling save,
  // but a direct call is exactly what this second pass exists for. Overlap
  // here means a mark counting twice in every average.
  const problems = validateCalendar(periods)
  if (problems.length > 0) {
    return { error: problems.map((pr) => pr.messageKm).join(' · ') }
  }

  return { periods }
}

/** The class rows currently stored for one year. */
async function fetchClassRows(
  classId: string,
  academicYear: string,
): Promise<ScoreCalendarPeriodRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('score_calendar_periods')
    .select('*')
    .eq('scope', 'class')
    .eq('class_id', classId)
    .eq('academic_year', academicYear)
    .order('sort_order', { ascending: true })
  if (error) {
    logger.error(error)
    return []
  }
  return (data ?? []) as ScoreCalendarPeriodRow[]
}

/** The audit trail records membership and shape, not row ids. */
const auditShape = (rows: { month_key: string; member_months: string[]; semester: string; starts_on?: string | null; ends_on?: string | null }[]) =>
  rows.map((r) => ({
    month_key: r.month_key,
    member_months: r.member_months,
    semester: r.semester,
    starts_on: r.starts_on ?? null,
    ends_on: r.ends_on ?? null,
  }))

/**
 * Replace the class's calendar for one year — copy-on-write, all rows at once.
 *
 * No service role exists, so "transaction" is delete + insert with a
 * best-effort restore: if the insert fails, the deleted rows are re-inserted.
 * The failure window is small and the fallout bounded — a class with zero rows
 * resolves the default calendar, never a broken one (INV-2).
 */
export async function saveClassCalendar(
  academicYear: string,
  input: CalendarPeriodInput[],
  classId?: string,
): Promise<ActionResult> {
  const gate = await calendarEditContext(classId)
  if ('error' in gate) return { error: gate.error }

  if (!ACADEMIC_YEAR_RE.test(academicYear)) return { error: 'ឆ្នាំសិក្សាមិនត្រឹមត្រូវ' }
  if (input.length === 0) return { error: 'ប្រតិទិនត្រូវតែមានវគ្គយ៉ាងតិចមួយ' }

  const parsed = periodsFromInput(input)
  if ('error' in parsed) return { error: parsed.error }
  const { periods } = parsed

  const supabase = await createClient()
  const before = await fetchClassRows(gate.classId, academicYear)

  // A locked period is closed history: it must survive the save with the same
  // membership and semester, and its lock rides across (P6 enforces the score
  // writes; this keeps the lock itself from being edited away).
  const byKey = new Map(periods.map((p) => [p.key as string, p]))
  for (const row of before) {
    if (row.locked_at === null) continue
    const kept = byKey.get(row.month_key)
    const sameMembers =
      kept !== undefined &&
      kept.members.length === row.member_months.length &&
      kept.members.every((m, i) => m === row.member_months[i])
    if (!kept || !sameMembers || kept.semester !== row.semester) {
      return { error: `វគ្គ ${row.label_km ?? row.month_key} បានចាក់សោរួច — មិនអាចរួម បំបែក ឬផ្លាស់ទីបានទេ` }
    }
  }
  const lockByKey = new Map(before.map((r) => [r.month_key, r]))

  const insertRows = periods.map((p) => ({
    scope: 'class' as const,
    class_id: gate.classId,
    academic_year: academicYear,
    month_key: p.key,
    member_months: p.members,
    // NULL on purpose: the label derives from the members at read time, so a
    // future wording change reaches every stored calendar.
    label_km: null,
    semester: p.semester,
    starts_on: p.startsOn,
    ends_on: p.endsOn,
    locked_at: lockByKey.get(p.key)?.locked_at ?? null,
    locked_by: lockByKey.get(p.key)?.locked_by ?? null,
    sort_order: p.sortOrder,
    updated_at: new Date().toISOString(),
  }))

  const { error: deleteError } = await supabase
    .from('score_calendar_periods')
    .delete()
    .eq('scope', 'class')
    .eq('class_id', gate.classId)
    .eq('academic_year', academicYear)
  if (deleteError) {
    logger.error(deleteError)
    return { error: deleteError.message }
  }

  const { error: insertError } = await supabase
    .from('score_calendar_periods')
    .insert(insertRows)
  if (insertError) {
    logger.error(insertError)
    // Best-effort restore so the class does not silently fall back to the
    // default calendar mid-edit. Fields listed rather than rest-spread: the
    // stored id must not ride along into a fresh insert.
    const restore = before.map((r) => ({
      scope: r.scope, class_id: r.class_id, school_id: r.school_id,
      academic_year: r.academic_year, month_key: r.month_key,
      member_months: r.member_months, label_km: r.label_km, semester: r.semester,
      starts_on: r.starts_on, ends_on: r.ends_on,
      locked_at: r.locked_at, locked_by: r.locked_by, sort_order: r.sort_order,
    }))
    if (restore.length > 0) {
      const { error: restoreError } = await supabase.from('score_calendar_periods').insert(restore)
      if (restoreError) logger.error('calendar restore failed:', restoreError)
    }
    return { error: insertError.message }
  }

  // The full before/after set, because a merge is a re-grade: the trail must
  // show exactly which partition produced which averages.
  await auditLog({
    action: 'score_calendar.updated',
    entityType: 'score_calendar',
    entityId: gate.classId,
    oldValue: { periods: auditShape(before) },
    newValue: { periods: auditShape(insertRows) },
    metadata: { academic_year: academicYear },
    actorId: gate.userId,
  })

  revalidatePath('/score/enter')
  revalidatePath('/score/total')
  revalidatePath('/score/subjects')
  return { success: true }
}

/**
 * Drop the class's own calendar for one year — back to inheriting the school's
 * calendar, or the default. Refused while any period is locked: unlocking is
 * an explicit, audited act and a reset must not absorb it.
 */
export async function resetClassCalendar(
  academicYear: string,
  classId?: string,
): Promise<ActionResult> {
  const gate = await calendarEditContext(classId)
  if ('error' in gate) return { error: gate.error }
  if (!ACADEMIC_YEAR_RE.test(academicYear)) return { error: 'ឆ្នាំសិក្សាមិនត្រឹមត្រូវ' }

  const before = await fetchClassRows(gate.classId, academicYear)
  if (before.length === 0) return { success: true }
  if (before.some((r) => r.locked_at !== null)) {
    return { error: 'មានវគ្គដែលបានចាក់សោ — សូមដោះសោជាមុនសិន' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('score_calendar_periods')
    .delete()
    .eq('scope', 'class')
    .eq('class_id', gate.classId)
    .eq('academic_year', academicYear)
  if (error) {
    logger.error(error)
    return { error: error.message }
  }

  await auditLog({
    action: 'score_calendar.reset',
    entityType: 'score_calendar',
    entityId: gate.classId,
    oldValue: { periods: auditShape(before) },
    metadata: { academic_year: academicYear },
    actorId: gate.userId,
  })

  revalidatePath('/score/enter')
  revalidatePath('/score/total')
  revalidatePath('/score/subjects')
  return { success: true }
}

/**
 * Lock or unlock one period — the score counterpart `attendance_locks` has
 * had since 00003. A locked period accepts no score writes (`saveScores`
 * refuses), cannot be merged, split, moved or reset (`saveClassCalendar` and
 * `resetClassCalendar` refuse), and shows a read-only grid.
 *
 * LOCKING follows the calendar-edit gate (homeroom teacher or school admin).
 * UNLOCKING is `isSchoolAdmin` only (§11.8): a lock a teacher can quietly
 * remove is not a lock. A self-serve teacher owns their organisation and so
 * holds the admin role — they can unlock their own class, which is right,
 * because there is no one else. Every lock AND unlock is audited.
 *
 * A class still on the inherited calendar has no rows to stamp, so the first
 * lock materialises the resolved calendar as class rows (the same
 * copy-on-write shape a save writes) with the lock applied — resolution is
 * unchanged because the copy IS what was resolving.
 */
export async function setPeriodLock(
  academicYear: string,
  monthKey: MonthId,
  locked: boolean,
  classId?: string,
): Promise<ActionResult> {
  const gate = await calendarEditContext(classId)
  if ('error' in gate) return { error: gate.error }
  if (!ACADEMIC_YEAR_RE.test(academicYear)) return { error: 'ឆ្នាំសិក្សាមិនត្រឹមត្រូវ' }
  if (!isMonthId(monthKey)) return { error: 'វគ្គមិនត្រឹមត្រូវ' }

  if (!locked) {
    const roles = await getUserRoles()
    if (roles === null || !isSchoolAdmin(roles.roles)) {
      return { error: 'មានតែអ្នកគ្រប់គ្រងសាលាប៉ុណ្ណោះ ដែលអាចដោះសោវគ្គបានទេ' }
    }
  }

  const supabase = await createClient()
  const stamp = locked
    ? { locked_at: new Date().toISOString(), locked_by: gate.userId }
    : { locked_at: null, locked_by: null }

  const before = await fetchClassRows(gate.classId, academicYear)

  if (before.length === 0) {
    if (!locked) return { success: true } // nothing stored, nothing locked
    const scope = await resolveServerScope(gate.userId, gate.classId)
    const calendar = await fetchScoreCalendar(scope, academicYear)
    const target = calendar.find((p) => p.key === monthKey)
    if (!target) return { error: 'វគ្គនេះមិនមានក្នុងប្រតិទិនទេ' }

    const { error } = await supabase.from('score_calendar_periods').insert(
      calendar.map((p) => ({
        scope: 'class' as const,
        class_id: gate.classId,
        academic_year: academicYear,
        month_key: p.key,
        member_months: p.members,
        label_km: null,
        semester: p.semester,
        starts_on: p.startsOn,
        ends_on: p.endsOn,
        ...(p.key === monthKey ? stamp : { locked_at: null, locked_by: null }),
        sort_order: p.sortOrder,
      })),
    )
    if (error) {
      logger.error(error)
      return { error: error.message }
    }
  } else {
    const row = before.find((r) => r.month_key === monthKey)
    if (!row) return { error: 'វគ្គនេះមិនមានក្នុងប្រតិទិនទេ' }
    if (locked && row.locked_at !== null) return { success: true }
    if (!locked && row.locked_at === null) return { success: true }

    const { error } = await supabase
      .from('score_calendar_periods')
      .update({ ...stamp, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) {
      logger.error(error)
      return { error: error.message }
    }
  }

  // A lock that can be removed silently is not a lock — both directions land
  // in the trail, with who and when.
  await auditLog({
    action: locked ? 'score_calendar.locked' : 'score_calendar.unlocked',
    entityType: 'score_calendar',
    entityId: gate.classId,
    metadata: { academic_year: academicYear, month_key: monthKey },
    actorId: gate.userId,
  })

  revalidatePath('/score/enter')
  revalidatePath('/score/subjects')
  return { success: true }
}

/**
 * How many monthly marks exist under the given months — what the editor shows
 * before a merge or disable hides them (§11.5 rule 3: narrowing never deletes
 * a mark, but the teacher confirms the hiding with the real number in front
 * of them, not a guess).
 */
export async function countScoresForMonths(
  months: MonthId[],
  academicYear: string,
  classId?: string,
): Promise<number> {
  if (months.length === 0 || !ACADEMIC_YEAR_RE.test(academicYear)) return 0

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const scope = await resolveServerScope(user.id, classId)
  const rosterIds = await rosterIdsForScope(scope)

  const periodKeys = months.filter(isMonthId).map((m) => `${m}-${academicYear}`)
  if (periodKeys.length === 0) return 0

  let query = supabase
    .from('scores')
    .select('id', { count: 'exact', head: true })
    .eq('score_type', 'monthly')
    .in('score_period', periodKeys)
    .or('score_value.not.is.null,score_text.not.is.null')

  query = rosterIds ? query.in('student_id', rosterIds) : query.eq('teacher_id', user.id)

  const { count, error } = await query
  if (error) {
    logger.error(error)
    return 0
  }
  return count ?? 0
}
