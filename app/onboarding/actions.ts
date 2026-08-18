'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'
import { auditLog, auditLogBatch } from '@/lib/audit/log'
import type { ActionResult } from '@/lib/types'
import { gradesForLevel, levelByKey } from '@/lib/onboarding/curriculum'

/**
 * First-time setup, as four writes.
 *
 * Only the first one needs the RPC. Once `create_teacher_organisation` (00017)
 * has granted the teacher `owner` on their own school, every later insert here
 * — education levels, grades, the class, their own assignment — is an ordinary
 * PostgREST write that the *existing* policies already permit, because all of
 * them gate on `is_school_admin()` and the owner role satisfies it. Nothing in
 * this file needs elevated rights.
 */

/** SQLSTATEs `create_teacher_organisation` raises, all with Khmer messages. */
const RPC_ERROR_CODES = new Set(['28000', '22023', '23505', 'P0002'])

/**
 * §28: never surface a raw database error. Our own RPC messages are written in
 * Khmer for the teacher and are safe to show; anything else is not.
 */
function friendlyError(error: { message?: string; code?: string } | null): string {
  if (error?.code && RPC_ERROR_CODES.has(error.code) && error.message) return error.message
  logger.error('onboarding:', error)
  return 'មិនអាចរក្សាទុកបានទេ។ សូមព្យាយាមម្តងទៀត។'
}

async function requireTeacher() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return { supabase, user }
}

/** The school this teacher owns. `profiles.school_id` is stamped by the RPC. */
async function resolveSchoolId(): Promise<{ schoolId: string | null; userId: string }> {
  const { supabase, user } = await requireTeacher()
  const { data } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', user.id)
    .maybeSingle()
  return { schoolId: data?.school_id ?? null, userId: user.id }
}

// ── Step 1 ──────────────────────────────────────────────────────────────────

export async function createOrganisation(
  name: string,
  kind: string,
): Promise<ActionResult> {
  const { supabase, user } = await requireTeacher()

  const trimmed = name.trim()
  if (!trimmed) return { error: 'សូមបញ្ចូលឈ្មោះស្ថាប័ន' }

  const { data: schoolId, error } = await supabase.rpc('create_teacher_organisation', {
    p_school_name: trimmed,
    p_kind: kind,
  })

  if (error) return { error: friendlyError(error) }

  await auditLog({
    action: 'organisation.created',
    entityType: 'school',
    entityId: schoolId as string,
    actorId: user.id,
  })

  redirect('/onboarding/level')
}

// ── Step 2 ──────────────────────────────────────────────────────────────────

/**
 * Create the chosen education level and its grades in one go.
 *
 * Seeding the whole grade range here rather than one row at a time is what lets
 * the next screen be a pure selection, and what lets a teacher move back and
 * forth between the two steps without creating duplicates — both inserts are
 * `upsert`s on the natural keys the schema already declares
 * (`UNIQUE (school_id, name)` and `UNIQUE (education_level_id, name)`).
 */
export async function chooseEducationLevel(levelKey: string): Promise<ActionResult> {
  const { supabase, user } = await requireTeacher()
  const { schoolId } = await resolveSchoolId()
  if (!schoolId) redirect('/onboarding/organisation')

  const level = levelByKey(levelKey)
  if (!level) return { error: 'សូមជ្រើសរើសកម្រិតសិក្សា' }

  const { data: levelRow, error: levelErr } = await supabase
    .from('education_levels')
    .upsert(
      { school_id: schoolId, name: level.name, name_en: level.nameEn, sort_order: level.sortOrder },
      { onConflict: 'school_id,name' },
    )
    .select('id')
    .single()

  if (levelErr || !levelRow) return { error: friendlyError(levelErr) }

  const { error: gradesErr } = await supabase.from('grades').upsert(
    gradesForLevel(level).map((g) => ({
      education_level_id: levelRow.id,
      name: g.name,
      sort_order: g.sortOrder,
    })),
    { onConflict: 'education_level_id,name' },
  )

  if (gradesErr) return { error: friendlyError(gradesErr) }

  await auditLog({
    action: 'education_level.created',
    entityType: 'education_level',
    entityId: levelRow.id,
    actorId: user.id,
  })

  redirect(`/onboarding/grade?level=${levelRow.id}`)
}

// ── Step 3 ──────────────────────────────────────────────────────────────────

/** Pure navigation — the grade row already exists from step 2. */
export async function chooseGrade(gradeId: string): Promise<ActionResult> {
  if (!gradeId) return { error: 'សូមជ្រើសរើសថ្នាក់' }
  redirect(`/onboarding/class?grade=${gradeId}`)
}

// ── Step 4 ──────────────────────────────────────────────────────────────────

export async function createClassAndAssign(input: {
  gradeId: string
  name: string
  academicYearId: string
}): Promise<ActionResult> {
  const { supabase, user } = await requireTeacher()

  const name = input.name.trim()
  if (!name) return { error: 'សូមបញ្ចូលឈ្មោះថ្នាក់' }
  if (!input.gradeId) return { error: 'សូមជ្រើសរើសថ្នាក់' }
  if (!input.academicYearId) return { error: 'សូមជ្រើសរើសឆ្នាំសិក្សា' }

  const { data: cls, error: classErr } = await supabase
    .from('classes')
    .insert({
      grade_id: input.gradeId,
      academic_year_id: input.academicYearId,
      name,
    })
    .select('id')
    .single()

  if (classErr || !cls) {
    // `UNIQUE (grade_id, academic_year_id, name)` — the one collision a teacher
    // can actually cause, so it gets its own sentence rather than the generic.
    if (classErr?.code === '23505') return { error: 'ថ្នាក់នេះមានរួចហើយ។ សូមប្តូរផ្នែក។' }
    return { error: friendlyError(classErr) }
  }

  // Homeroom, because a teacher setting up their own class is its form master.
  // `student_enrollments_write_assigned_or_admin` keys the roster write on
  // exactly this flag, so without it the next step could not add a student.
  const { error: assignErr } = await supabase.from('teacher_assignments').insert({
    teacher_id: user.id,
    class_id: cls.id,
    academic_year_id: input.academicYearId,
    is_homeroom: true,
    status: 'active',
  })

  if (assignErr) {
    // The class row alone is harmless (no assignment ⇒ still legacy scope),
    // but remove it anyway so a retry does not hit the unique name constraint.
    await supabase.from('classes').delete().eq('id', cls.id)
    return { error: friendlyError(assignErr) }
  }

  // The assignment above just flipped every scoped read to v2, where the
  // roster comes from student_enrollments — a table nothing else on the
  // teacher side writes. Any students this account already has (the legacy
  // roster) must be enrolled *now*, or they vanish from every screen the
  // moment we redirect. Must run after the assignment: the RPC resolves the
  // target class from the caller's own homeroom assignments (00018).
  const { data: enrolled, error: backfillErr } = await supabase.rpc(
    'backfill_teacher_enrolments',
    { p_class_id: cls.id },
  )

  if (backfillErr) {
    // Roll the assignment and the class back rather than leaving them and
    // asking the teacher to retry: with the assignment in place they are in
    // exactly the broken state this call exists to prevent (v2 scope, empty
    // roster), and a resubmit would trip UNIQUE (grade_id, academic_year_id,
    // name) on the class insert above — an error they cannot fix. Deleting
    // both returns the account to the legacy state it was in before
    // submitting, where their students are still visible and pressing the
    // button again is safe. Assignment first — it references the class.
    // Should either delete itself fail, the recovery banner on /student-list
    // detects the stranded state and re-runs this same RPC.
    await supabase
      .from('teacher_assignments')
      .delete()
      .eq('teacher_id', user.id)
      .eq('class_id', cls.id)
    await supabase.from('classes').delete().eq('id', cls.id)
    return { error: friendlyError(backfillErr) }
  }

  const backfilled = Number(enrolled ?? 0)
  if (backfilled > 0) {
    await auditLogBatch(
      'enrollment.backfilled',
      'student_enrollment',
      backfilled,
      { class_id: cls.id, trigger: 'onboarding' },
      user.id,
    )
  }

  await auditLog({
    action: 'class.created',
    entityType: 'class',
    entityId: cls.id,
    actorId: user.id,
  })

  redirect(`/onboarding/students?class=${cls.id}`)
}
