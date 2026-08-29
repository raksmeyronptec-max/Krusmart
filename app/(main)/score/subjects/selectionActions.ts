'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'
import { logger } from '@/lib/utils/logger'
import { classContext } from './classContext'
import { resolveTemplate, type TemplateScoreType } from '@/lib/scores/template'
import type { ClassSubjectSelection } from '@/lib/scores/selection'
import type { ActionResult } from '@/lib/types'

/**
 * Choosing which curriculum subjects a class teaches — `class_template_subjects`
 * (migration 00028).
 *
 * The one rule that shapes every action here: **a teacher may only select a
 * subject the server has already resolved for their class.** There is no
 * free-text path, no client-supplied label, no way to coin a `subject_key` —
 * `assertKnownSubjects` re-resolves the class's own template and refuses
 * anything absent from it. That is what makes `/score/subjects` a configuration
 * screen rather than a second, uncontrolled curriculum editor (§7).
 *
 * A teacher *adding a subject of their own* is a different operation with a
 * different guarantee, and it stays where it was: `addClassSubject` in
 * `actions.ts` writes a `scope='class'` definition with a server-minted `cls_`
 * key. Those two paths must not merge — one picks from the curriculum, the
 * other extends it, and a reader of `scores.subject` can still tell which is
 * which from the key prefix.
 *
 * The class always comes from the caller's own assignments (`classContext`),
 * never from the request, and RLS on `class_template_subjects` checks the same
 * thing independently.
 */

/** Every subject key the class's curriculum defines, across both grids. */
function knownSubjectKeys(ctx: { rows: Parameters<typeof resolveTemplate>[0]; context: Parameters<typeof resolveTemplate>[2] }): Set<string> {
  const keys = new Set<string>()
  for (const scoreType of ['monthly', 'semester', 'annual', 'homework'] as TemplateScoreType[]) {
    for (const s of resolveTemplate(ctx.rows, scoreType, ctx.context)) keys.add(s.subjectKey)
  }
  return keys
}

/**
 * Read the class's chosen subjects. Used to refresh the editor after a write.
 */
export async function listClassSelection(classId?: string): Promise<ClassSubjectSelection[]> {
  const ctx = await classContext(classId)
  if ('error' in ctx) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('class_template_subjects')
    .select('subject_key, enabled_columns, sort_order')
    .eq('class_id', ctx.classId)
    .order('sort_order', { ascending: true })

  if (error) {
    logger.error(error)
    return []
  }

  return (data ?? []).map((r) => ({
    subjectKey: r.subject_key as string,
    enabledColumns: (r.enabled_columns as string[] | null) ?? null,
    sortOrder: (r.sort_order as number | null) ?? 0,
  }))
}

/**
 * Add curriculum subjects to the class's template.
 *
 * Takes a list because the picker is multi-select: a teacher configuring a
 * class for the first time chooses Khmer, maths and science in one pass, and
 * three round trips to do it would be three chances to half-fail.
 *
 * Duplicates are ignored rather than rejected (§22). The unique index is the
 * real guard — two teachers on one class can race the picker — and to the
 * teacher who just re-picked a subject they already had, "already added" is not
 * an error worth a red toast.
 */
export async function addTemplateSubjects(
  subjectKeys: string[],
  classId?: string,
): Promise<ActionResult & { added?: number }> {
  const ctx = await classContext(classId)
  if ('error' in ctx) return { error: ctx.error }

  const wanted = [...new Set(subjectKeys.map((k) => k.trim()).filter(Boolean))]
  if (wanted.length === 0) return { error: 'សូមជ្រើសរើសមុខវិជ្ជាយ៉ាងតិចមួយ' }

  // The gate: nothing outside this class's own resolved curriculum.
  const known = knownSubjectKeys(ctx)
  const unknown = wanted.filter((k) => !known.has(k))
  if (unknown.length > 0) {
    logger.error('addTemplateSubjects: unknown keys', unknown)
    return { error: 'មុខវិជ្ជាដែលបានជ្រើសរើសមិនមានក្នុងកម្មវិធីសិក្សារបស់ថ្នាក់នេះទេ' }
  }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('class_template_subjects')
    .select('subject_key, sort_order')
    .eq('class_id', ctx.classId)

  const already = new Set((existing ?? []).map((r) => r.subject_key as string))
  const fresh = wanted.filter((k) => !already.has(k))
  if (fresh.length === 0) return { success: true, added: 0 }

  // New subjects go to the end, in the order the curriculum lists them so the
  // class's list reads like the register rather than like click order.
  const base = (existing ?? []).reduce((max, r) => Math.max(max, (r.sort_order as number) ?? 0), 0)
  const curriculumOrder = [...known]
  const ordered = fresh.sort((a, b) => curriculumOrder.indexOf(a) - curriculumOrder.indexOf(b))

  const { error } = await supabase.from('class_template_subjects').insert(
    ordered.map((subject_key, i) => ({
      class_id: ctx.classId,
      subject_key,
      enabled_columns: null,
      sort_order: base + (i + 1) * 10,
    })),
  )

  if (error) {
    logger.error(error)
    // 23505: a colleague on the same class added one of these between our read
    // and our write. Their row is the one that should stand.
    if (error.code === '23505') return { success: true, added: 0 }
    return { error: error.message }
  }

  await auditLog({
    action: 'class_template.subjects_added',
    entityType: 'class_template_subject',
    newValue: { subject_keys: ordered },
    metadata: { class_id: ctx.classId, count: ordered.length },
    actorId: ctx.userId,
  })

  revalidatePath('/score/subjects')
  revalidatePath('/score/enter')
  return { success: true, added: ordered.length }
}

/**
 * Drop a subject from the class's template.
 *
 * Removes the *selection*, never the subject and never a mark. Anything already
 * recorded in `scores` under this subject's columns keeps resolving on the
 * totals grid and on reports — the same contract `hidden` has on the definition
 * layer, and the reason the confirmation copy says so.
 */
export async function removeTemplateSubject(
  subjectKey: string,
  classId?: string,
): Promise<ActionResult> {
  const ctx = await classContext(classId)
  if ('error' in ctx) return { error: ctx.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('class_template_subjects')
    .delete()
    .eq('class_id', ctx.classId)
    .eq('subject_key', subjectKey)

  if (error) {
    logger.error(error)
    return { error: error.message }
  }

  await auditLog({
    action: 'class_template.subject_removed',
    entityType: 'class_template_subject',
    oldValue: { subject_key: subjectKey },
    metadata: { class_id: ctx.classId },
    actorId: ctx.userId,
  })

  revalidatePath('/score/subjects')
  revalidatePath('/score/enter')
  return { success: true }
}

/**
 * Set which components of a subject the class marks.
 *
 * Passing every column — or none — stores NULL rather than a copy of the list,
 * so a later change to the subject's definition still reaches this class. A
 * stored copy would silently pin the columns, which is the same trap
 * `updateClassSubject` deletes redundant override rows to avoid.
 */
export async function setSubjectComponents(
  subjectKey: string,
  columnIds: string[],
  classId?: string,
): Promise<ActionResult> {
  const ctx = await classContext(classId)
  if ('error' in ctx) return { error: ctx.error }

  // Validate against the subject's own definition: a column id that is not one
  // of this subject's columns would render nothing and silently lose marks.
  const subject = (['monthly', 'semester', 'annual', 'homework'] as TemplateScoreType[])
    .flatMap((t) => resolveTemplate(ctx.rows, t, ctx.context))
    .find((s) => s.subjectKey === subjectKey)

  if (!subject) return { error: 'រកមិនឃើញមុខវិជ្ជានេះទេ' }

  const valid = new Set(subject.columns.map((c) => c.id))
  const wanted = [...new Set(columnIds)].filter((id) => valid.has(id))
  if (wanted.length === 0) return { error: 'សូមជ្រើសរើសផ្នែកយ៉ាងតិចមួយ' }

  const enabled = wanted.length === subject.columns.length ? null : wanted

  const supabase = await createClient()
  const { error } = await supabase
    .from('class_template_subjects')
    .update({ enabled_columns: enabled, updated_at: new Date().toISOString() })
    .eq('class_id', ctx.classId)
    .eq('subject_key', subjectKey)

  if (error) {
    logger.error(error)
    return { error: error.message }
  }

  await auditLog({
    action: 'class_template.components_updated',
    entityType: 'class_template_subject',
    newValue: { subject_key: subjectKey, enabled_columns: enabled },
    metadata: { class_id: ctx.classId },
    actorId: ctx.userId,
  })

  revalidatePath('/score/subjects')
  revalidatePath('/score/enter')
  return { success: true }
}

/**
 * Swap two chosen subjects' positions.
 *
 * Adjacent swaps rather than a renumber of the whole list, matching
 * `swapClassSubjectOrder` on the definition layer — a teacher who moves one
 * subject writes two rows, not the whole template.
 */
export async function swapSelectionOrder(
  keyA: string,
  keyB: string,
  classId?: string,
): Promise<ActionResult> {
  const ctx = await classContext(classId)
  if ('error' in ctx) return { error: ctx.error }

  const supabase = await createClient()
  const { data, error: readError } = await supabase
    .from('class_template_subjects')
    .select('subject_key, sort_order')
    .eq('class_id', ctx.classId)
    .in('subject_key', [keyA, keyB])

  if (readError) {
    logger.error(readError)
    return { error: readError.message }
  }

  const rowA = (data ?? []).find((r) => r.subject_key === keyA)
  const rowB = (data ?? []).find((r) => r.subject_key === keyB)
  if (!rowA || !rowB) return { error: 'រកមិនឃើញមុខវិជ្ជានេះទេ' }

  const orderA = (rowA.sort_order as number) ?? 0
  // Equal orders would make the swap a no-op; nudge one so the result is
  // unambiguous rather than falling through to the subject_key tiebreak.
  const orderB = (rowB.sort_order as number) === orderA ? orderA + 1 : (rowB.sort_order as number)

  for (const [key, sort_order] of [[keyA, orderB], [keyB, orderA]] as const) {
    const { error } = await supabase
      .from('class_template_subjects')
      .update({ sort_order, updated_at: new Date().toISOString() })
      .eq('class_id', ctx.classId)
      .eq('subject_key', key)

    if (error) {
      logger.error(error)
      return { error: error.message }
    }
  }

  revalidatePath('/score/subjects')
  revalidatePath('/score/enter')
  return { success: true }
}
