'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/rbac/server'
import { auditLog } from '@/lib/audit/log'
import { logger } from '@/lib/utils/logger'
import { NOT_A_SCHOOL_TEACHER, RLS_REFUSED } from '@/lib/utils/rpc-errors'
import { CLASS_SECTIONS, generatedClassName, gradeName } from '@/lib/onboarding/curriculum'
import type { ActionResult } from '@/lib/types'

/**
 * Renaming and archiving a class, for `/classroom`.
 *
 * ── Two gates that must agree, and one failure mode they exist to prevent ───
 *
 * `classes` and `teacher_assignments` both carry only an ADMIN write policy
 * (`classes_admin_write` / `teacher_assignments_admin_write`, 00003) — there is
 * no "own row" policy for a teacher. A self-serve teacher passes anyway because
 * `create_teacher_organisation` grants them `owner` on the school they created;
 * a teacher who *joined* someone else's school through `join_requests` holds
 * plain `teacher`, which the permission table gives `classes` READ_ONLY.
 *
 * That asymmetry matters because of how PostgREST fails: an UPDATE the policy
 * rejects is **not an error**. It matches no rows, returns 200, and a caller
 * that only checks `error` shows a success toast over a class that did not
 * change. So both actions here do two things:
 *
 *   1. `requirePermission('classes:update')` — the same line the RLS draws,
 *      surfaced as a Khmer sentence instead of a silent no-op.
 *   2. `.select('id')` on every write, and treat an empty result as a refusal.
 *      Belt and braces: the permission table is the app's model of the policy,
 *      and the database is the policy.
 *
 * Neither trusts `classId`. It is always resolved through the caller's own
 * active assignments first, so a forged id matches nothing.
 */

/** The caller's active assignment rows on a class, or `[]` if they hold none. */
async function ownAssignments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  classId: string,
): Promise<{ id: string; academic_year_id: string }[]> {
  const { data } = await supabase
    .from('teacher_assignments')
    .select('id, academic_year_id')
    .eq('teacher_id', userId)
    .eq('class_id', classId)
    .eq('status', 'active')

  return data ?? []
}

/**
 * Change a class's section letter — `៥ក` → `៥ខ`.
 *
 * ★ THE GRADE HALF OF THE NAME IS NOT EDITABLE, and this is not a simplifying
 * choice. `classes.name` is `generatedClassName(gradeNumber, section)`, derived
 * so that the name and the grade cannot drift; a free-typed field would let a
 * grade-5 class be called `៧ខ`, and the grade — not the name — is what resolves
 * the score template. So the section is the input, and the name is regenerated
 * from the class's own grade rather than from anything the browser sent.
 *
 * The academic year is not editable either: moving a class between years would
 * re-point every mark already entered against it.
 */
export async function renameClass(input: {
  classId: string
  section: string
}): Promise<ActionResult> {
  await requirePermission('classes:update')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // A closed vocabulary, not free text: the section is half of a UNIQUE key.
  if (!(CLASS_SECTIONS as readonly string[]).includes(input.section)) {
    return { error: 'ផ្នែកមិនត្រឹមត្រូវ' }
  }

  const held = await ownAssignments(supabase, user.id, input.classId)
  if (held.length === 0) return { error: 'អ្នកមិនមានសិទ្ធិលើថ្នាក់នេះទេ' }

  // The grade comes from the row, never from the caller — see the note above.
  const { data: cls } = await supabase
    .from('classes')
    .select('id, name, grades(sort_order)')
    .eq('id', input.classId)
    .maybeSingle()

  if (!cls) return { error: 'រកមិនឃើញថ្នាក់នេះទេ' }

  const gradeRel = (cls as { grades?: { sort_order?: number } | { sort_order?: number }[] }).grades
  const gradeNumber = (Array.isArray(gradeRel) ? gradeRel[0] : gradeRel)?.sort_order
  if (typeof gradeNumber !== 'number') {
    return { error: 'ថ្នាក់នេះមិនទាន់មានកម្រិតច្បាស់លាស់ទេ' }
  }

  const name = generatedClassName(gradeNumber, input.section)
  if (name === cls.name) return { success: true }

  const { data: updated, error } = await supabase
    .from('classes')
    .update({ name })
    .eq('id', input.classId)
    .select('id')

  if (error) {
    // UNIQUE (grade_id, academic_year_id, name) — the section is taken.
    if (error.code === '23505') return { error: 'ផ្នែកនេះមានថ្នាក់រួចហើយ។ សូមជ្រើសផ្នែកផ្សេង។' }
    logger.error(error)
    return { error: 'មិនអាចប្តូរឈ្មោះថ្នាក់បានទេ' }
  }

  // Zero rows with no error is the RLS refusal described in the module note.
  if (!updated || updated.length === 0) {
    return { error: 'មានតែនាយកសាលាប៉ុណ្ណោះដែលអាចប្តូរឈ្មោះថ្នាក់បាន' }
  }

  await auditLog({
    action: 'class.updated',
    entityType: 'class',
    entityId: input.classId,
    oldValue: { name: cls.name },
    newValue: { name },
    actorId: user.id,
  })

  revalidatePath('/classroom')
  return { success: true }
}

/**
 * Archive a class — remove it from the teacher's list without destroying it.
 *
 * ★ THERE IS NO DELETE, and nothing here should ever grow one. A `classes` row
 * has scores, attendance and `student_enrollments` behind it, every one of them
 * `ON DELETE CASCADE`; deleting the class silently destroys a year of marks.
 * Archiving flips `teacher_assignments.status` away from `'active'`, which is
 * what every scoped read already filters on, so the class simply stops being
 * listed. The marks stay exactly where they are and a school admin can still
 * reach them.
 *
 * ALL of the caller's active rows on the class are archived, not just the one
 * the card selects with. A teacher can hold both a homeroom row and a subject
 * row on one class (00025); leaving the second active would keep the class in a
 * list the teacher just removed it from, which reads as the button not working.
 */
export async function archiveClass(input: { classId: string }): Promise<ActionResult> {
  await requirePermission('classes:update')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const held = await ownAssignments(supabase, user.id, input.classId)
  if (held.length === 0) return { error: 'អ្នកមិនមានសិទ្ធិលើថ្នាក់នេះទេ' }

  /*
   * Refused, not warned, when this is the last one.
   *
   * `resolveServerScope` returns v2 while any active assignment exists and
   * falls back to legacy `teacher_id` scoping when none does. Archiving the
   * last class therefore does not just empty a list — it changes how every
   * screen in the app resolves its roster, and any pupil enrolled by a
   * colleague rather than created under this account disappears from all of
   * them. That is not a consequence a confirmation dialog can fairly describe,
   * and it is trivially avoidable: create the next class first.
   */
  const { count: otherActive } = await supabase
    .from('teacher_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', user.id)
    .eq('status', 'active')
    .neq('class_id', input.classId)

  if ((otherActive ?? 0) === 0) {
    return {
      error: 'នេះជាថ្នាក់សកម្មតែមួយគត់របស់អ្នក។ សូមបង្កើតថ្នាក់ថ្មីជាមុនសិន មុននឹងទុកថ្នាក់នេះក្នុងប័ណ្ណសារ។',
    }
  }

  const { data: archived, error } = await supabase
    .from('teacher_assignments')
    .update({ status: 'archived' })
    .eq('teacher_id', user.id)
    .eq('class_id', input.classId)
    .eq('status', 'active')
    .select('id')

  if (error) {
    logger.error(error)
    return { error: 'មិនអាចទុកថ្នាក់ក្នុងប័ណ្ណសារបានទេ' }
  }

  if (!archived || archived.length === 0) {
    return { error: 'មានតែនាយកសាលាប៉ុណ្ណោះដែលអាចទុកថ្នាក់ក្នុងប័ណ្ណសារបាន' }
  }

  // `class.archived`, not the union's `class.deleted`: nothing was deleted, and
  // an audit trail that says otherwise is worse than none.
  await auditLog({
    action: 'class.archived',
    entityType: 'class',
    entityId: input.classId,
    oldValue: { assignments: held.map((a) => a.id), status: 'active' },
    newValue: { status: 'archived' },
    actorId: user.id,
  })

  revalidatePath('/classroom')
  return { success: true }
}

/**
 * Make sure a grade row exists, and return its id.
 *
 * ── Why this action exists ─────────────────────────────────────────────────
 *
 * "បង្កើតថ្នាក់ថ្មី" used to offer only the `grades` rows a school happened to
 * hold. `seedEducationLevel` writes a level's whole range, so a school created
 * through the current wizard has all six primary grades — but one seeded by an
 * older path, or one whose upsert failed, holds a single row and the dialog
 * then offers a single grade. Nothing in the teacher app could add another:
 * `/admin/classes` needs a principal and the wizard's level step runs once.
 *
 * The dialog now offers the level's full curriculum range and calls this for
 * the grade the teacher actually picked. Rows are written for grades that get
 * used, not for every grade on every page load.
 *
 * ── The name is derived, never sent ────────────────────────────────────────
 *
 * `gradeName(n)` regenerates `ថ្នាក់ទី៥` from the number, exactly as
 * `gradesForLevel` does. Accepting a name from the browser would let a school
 * grow a grade called anything, and `classes.name` is generated from the grade
 * number — the two would drift, and the grade is what resolves the score
 * template.
 *
 * ── The gate is authentication, and RLS is the boundary ───────────────────
 *
 * ★ NOT `requirePermission('classes:update')`. That was the first version of
 * this action and it crashed the page: the permission matrix gives a plain
 * `teacher` `classes` READ_ONLY, `requirePermission` *throws* rather than
 * returning, and an uncaught throw inside a server action surfaces as a
 * runtime error over the whole screen rather than a message in the dialog.
 *
 * It was also the wrong line to draw. This action is one step of the
 * create-class flow, and that flow's gate is `createClassAndAssign`'s:
 * authenticate, then let the policies decide. Gating this more strictly than
 * the class insert it precedes would refuse teachers who can demonstrably
 * create classes — the two must agree, and the database is the one that gets to
 * be right.
 *
 * Which policy decides changed in 00031 and this action did not have to: it was
 * `grades_admin_write` alone, so every teacher who was not also an
 * administrator got the zero-row refusal below — including the ones the join
 * flow creates, for whom /classroom offered a dialog that could not succeed.
 * `grades_teacher_insert` now also admits a teacher of the level's own school,
 * INSERT only. Renaming and deleting a grade stay administrator-only, which is
 * the half that matters: `classes.name` is generated from the grade.
 *
 * So a caller who may not write grades is still told so in Khmer, by the
 * zero-row check below, exactly as `renameClass` and `archiveClass` explain
 * their own refusals. Those two keep `requirePermission` because the UI only
 * offers them when `can('classes:update')` already passed; this one is reached
 * from the create dialog, which is not gated on that.
 *
 * `UNIQUE (education_level_id, name)` makes the upsert safe against a race with
 * a colleague creating the same class. The level is re-read against the
 * caller's own school first, so a forged `educationLevelId` names a level that
 * is simply not there.
 *
 * This writes structure only: no class, no assignment, no enrolment. If the
 * class creation that follows fails, an unused grade row is left behind, which
 * is harmless and will be reused rather than duplicated.
 */
export async function ensureGrade(input: {
  educationLevelId: string
  gradeNumber: number
}): Promise<ActionResult & { gradeId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  if (!Number.isInteger(input.gradeNumber) || input.gradeNumber < 1 || input.gradeNumber > 12) {
    return { error: 'ថ្នាក់មិនត្រឹមត្រូវ' }
  }

  // The level must be one this caller's school holds. RLS would refuse the
  // insert anyway; this turns that into a sentence rather than a silent zero.
  const { data: level } = await supabase
    .from('education_levels')
    .select('id, name')
    .eq('id', input.educationLevelId)
    .maybeSingle()

  if (!level) return { error: 'រកមិនឃើញកម្រិតសិក្សានេះទេ' }

  const name = gradeName(input.gradeNumber)

  const { data: existing } = await supabase
    .from('grades')
    .select('id')
    .eq('education_level_id', level.id)
    .eq('name', name)
    .maybeSingle()

  if (existing?.id) return { success: true, gradeId: existing.id as string }

  const { data: created, error } = await supabase
    .from('grades')
    .upsert(
      { education_level_id: level.id, name, sort_order: input.gradeNumber },
      { onConflict: 'education_level_id,name' },
    )
    .select('id')
    .maybeSingle()

  if (error) {
    /*
     * Re-read before reporting, because the likeliest failure here is a race
     * that has already produced what the caller wants. 00031 gives a teacher
     * INSERT on `grades` and deliberately not UPDATE, so when a colleague
     * created the same grade a moment ago the upsert's conflict branch is
     * refused (42501) rather than resolving — and 23505 says the same thing
     * where the conflict target is not taken. Either way the row now exists,
     * and this action's contract is an id, not a write.
     */
    const { data: raced } = await supabase
      .from('grades')
      .select('id')
      .eq('education_level_id', level.id)
      .eq('name', name)
      .maybeSingle()
    if (raced?.id) return { success: true, gradeId: raced.id as string }

    logger.error(error)
    // A genuine policy refusal: the caller does not teach at the school that
    // owns this level, so no re-read will ever find the row either.
    if (error.code === RLS_REFUSED) return { error: NOT_A_SCHOOL_TEACHER }
    return { error: 'មិនអាចបង្កើតកម្រិតថ្នាក់នេះបានទេ' }
  }

  // Zero rows with no error is the RLS refusal described in the module note.
  if (!created?.id) {
    return { error: NOT_A_SCHOOL_TEACHER }
  }

  await auditLog({
    action: 'grade.created',
    entityType: 'grade',
    entityId: created.id as string,
    newValue: { name, sort_order: input.gradeNumber, education_level_id: level.id },
    actorId: user.id,
  })

  revalidatePath('/classroom')
  return { success: true, gradeId: created.id as string }
}
