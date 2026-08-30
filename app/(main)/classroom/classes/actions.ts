'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/rbac/server'
import { auditLog } from '@/lib/audit/log'
import { logger } from '@/lib/utils/logger'
import { CLASS_SECTIONS, generatedClassName } from '@/lib/onboarding/curriculum'
import type { ActionResult } from '@/lib/types'

/**
 * Renaming and archiving a class, for `/classroom/classes`.
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

  revalidatePath('/classroom/classes')
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

  revalidatePath('/classroom/classes')
  revalidatePath('/classroom')
  return { success: true }
}
