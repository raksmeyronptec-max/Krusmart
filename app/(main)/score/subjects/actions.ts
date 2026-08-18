'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/rbac/server'
import { auditLog } from '@/lib/audit/log'
import { logger } from '@/lib/utils/logger'
import { getErrorMessage } from '@/lib/utils/errors'
import { fetchScoreTemplate, resolveServerScope } from '@/lib/utils/serverScope'
import {
  filterRowsForContext,
  overrideDiffers,
  type OverridableFields,
  type SubjectColumn,
  type TemplateScoreType,
} from '@/lib/scores/template'
import type { ActionResult, ScoreTemplateSubjectRow } from '@/lib/types'

/**
 * Writing the `class` layer of the score template.
 *
 * Three things shape every action in this file.
 *
 * **A class row is a whole definition, not a delta.** `resolveTemplate` picks
 * the winning row and reads *all* of its fields — it does not merge field by
 * field. So renaming one label means writing a class row carrying the inherited
 * columns, maximum, score types and group as well. Anything less would silently
 * drop the columns a subject is entered against.
 *
 * **A row that says nothing is deleted, not stored.** If an edit leaves the
 * class row identical to what it inherits, it is removed. A redundant row still
 * *pins* the definition: a later change to the national default would never
 * reach this class. Inheritance staying live is the point of the layering.
 *
 * **The class comes from the caller's assignments, never from the request.**
 * `resolveServerScope` validates any requested class id against the teacher's
 * own active assignments, so a forged one cannot widen access — and the RLS
 * policy in 00016 checks the same thing again independently.
 */

/** Fields a teacher may change. Everything else is inherited verbatim. */
export interface SubjectPatch {
  label_km?: string
  max_score?: number
  hidden?: boolean
  sort_order?: number
}

interface ClassContext {
  userId: string
  classId: string
  /**
   * Already narrowed to this class's curriculum (level / grade / track,
   * 00021). Without the narrowing, a grade-12 class would see two system rows
   * per subject key — one per track — and `splitRows` could inherit from the
   * wrong stream's full mark.
   */
  rows: ScoreTemplateSubjectRow[]
}

/**
 * Resolve the class being edited, or an error to show the teacher.
 *
 * A legacy account with no assignment has no class layer to write to — RLS
 * would reject the insert anyway, so the refusal is explained here in Khmer
 * rather than surfacing as an opaque failure.
 */
async function classContext(classId?: string): Promise<ClassContext | { error: string }> {
  try {
    await requirePermission('scores:update')
  } catch (e) {
    return { error: getErrorMessage(e) }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'សូមចូលគណនីជាមុនសិន' }

  const scope = await resolveServerScope(user.id, classId)
  if (scope.mode !== 'v2') {
    return { error: 'គណនីនេះមិនទាន់មានថ្នាក់រៀនទេ ដូច្នេះមិនអាចកែបញ្ជីមុខវិជ្ជាតាមថ្នាក់បានឡើយ។' }
  }

  const { rows, context } = await fetchScoreTemplate(scope)
  return { userId: user.id, classId: scope.classId, rows: filterRowsForContext(rows, context) }
}

function splitRows(rows: ScoreTemplateSubjectRow[], subjectKey: string) {
  const forKey = rows.filter((r) => r.subject_key === subjectKey)
  return {
    override: forKey.find((r) => r.scope === 'class') ?? null,
    // system loses to school; `fetchScoreTemplateRows` returns at most one of each.
    inherited: forKey.find((r) => r.scope === 'school') ?? forKey.find((r) => r.scope === 'system') ?? null,
  }
}

/** Read the template rows for the active class — used to refresh after a write. */
export async function getClassTemplateRows(classId?: string): Promise<ScoreTemplateSubjectRow[]> {
  const ctx = await classContext(classId)
  return 'error' in ctx ? [] : ctx.rows
}

/**
 * Apply a change to one subject for this class.
 *
 * Writes a complete class row built from whatever the class currently resolves
 * to, deletes it instead when the result no longer differs from the inherited
 * definition, and never touches `subject_key` — that value is what
 * `scores.subject` holds, and renaming it would detach every mark recorded
 * against it.
 */
export async function updateClassSubject(
  subjectKey: string,
  patch: SubjectPatch,
  classId?: string,
  /** Internal: one retry after a lost insert race. Not part of the public call. */
  retry = 0,
): Promise<ActionResult> {
  const ctx = await classContext(classId)
  if ('error' in ctx) return { error: ctx.error }

  const { override, inherited } = splitRows(ctx.rows, subjectKey)
  const base = override ?? inherited
  if (!base) return { error: 'រកមិនឃើញមុខវិជ្ជានេះទេ' }

  if (patch.max_score !== undefined && !(patch.max_score > 0)) {
    return { error: 'ពិន្ទុពេញត្រូវតែធំជាងសូន្យ' }
  }
  if (patch.label_km !== undefined && !patch.label_km.trim()) {
    return { error: 'សូមបញ្ចូលឈ្មោះមុខវិជ្ជា' }
  }

  const candidate: OverridableFields = {
    label_km: patch.label_km?.trim() ?? base.label_km,
    group_label: base.group_label ?? null,
    columns: base.columns,
    max_score: patch.max_score ?? Number(base.max_score),
    value_kind: base.value_kind,
    score_types: base.score_types,
    sort_order: patch.sort_order ?? base.sort_order,
    hidden: patch.hidden ?? base.hidden,
  }

  const supabase = await createClient()

  // The edit cancelled out: drop the override so the class tracks its school
  // and the national default again.
  if (!overrideDiffers(candidate, inherited)) {
    if (!override) return { success: true }
    const { error } = await supabase
      .from('score_template_subjects')
      .delete()
      .eq('id', override.id)
      .eq('scope', 'class')
      .eq('class_id', ctx.classId)

    if (error) {
      logger.error(error)
      return { error: error.message }
    }

    await auditLog({
      action: 'score_template.reverted',
      entityType: 'score_template_subject',
      entityId: override.id,
      oldValue: { subject_key: subjectKey },
      metadata: { class_id: ctx.classId, subject_key: subjectKey },
      actorId: ctx.userId,
    })

    revalidatePath('/score/subjects')
    revalidatePath('/score/enter')
    return { success: true }
  }

  if (override) {
    const { error } = await supabase
      .from('score_template_subjects')
      .update({ ...candidate, updated_at: new Date().toISOString() })
      .eq('id', override.id)
      .eq('scope', 'class')
      .eq('class_id', ctx.classId)

    if (error) {
      logger.error(error)
      return { error: error.message }
    }
  } else {
    const { error } = await supabase.from('score_template_subjects').insert({
      scope: 'class',
      class_id: ctx.classId,
      subject_key: subjectKey,
      ...candidate,
    })

    if (error) {
      logger.error(error)
      // 23505: another teacher on this class created the override between our
      // read and our write. Their row is the one to amend, not a second row.
      // One retry only — the re-read takes the UPDATE branch, so a second
      // failure is a real error rather than a race worth spinning on.
      if (error.code === '23505' && retry === 0) {
        return updateClassSubject(subjectKey, patch, classId, 1)
      }
      return { error: error.message }
    }
  }

  await auditLog({
    action: override ? 'score_template.updated' : 'score_template.created',
    entityType: 'score_template_subject',
    entityId: override?.id ?? null,
    oldValue: override ? { label_km: override.label_km, max_score: override.max_score, hidden: override.hidden, sort_order: override.sort_order } : null,
    newValue: { label_km: candidate.label_km, max_score: candidate.max_score, hidden: candidate.hidden, sort_order: candidate.sort_order },
    metadata: { class_id: ctx.classId, subject_key: subjectKey },
    actorId: ctx.userId,
  })

  revalidatePath('/score/subjects')
  revalidatePath('/score/enter')
  return { success: true }
}

/**
 * Swap two subjects' positions.
 *
 * Reordering is expressed as adjacent swaps rather than a renumber of the whole
 * list, so a teacher who moves one subject writes two rows instead of fourteen.
 * That keeps every untouched subject inheriting.
 */
export async function swapClassSubjectOrder(
  keyA: string,
  keyB: string,
  classId?: string,
): Promise<ActionResult> {
  const ctx = await classContext(classId)
  if ('error' in ctx) return { error: ctx.error }

  const a = splitRows(ctx.rows, keyA)
  const b = splitRows(ctx.rows, keyB)
  const rowA = a.override ?? a.inherited
  const rowB = b.override ?? b.inherited
  if (!rowA || !rowB) return { error: 'រកមិនឃើញមុខវិជ្ជានេះទេ' }

  // Equal sort_orders would make the swap a no-op; nudge one so the order is
  // unambiguous rather than falling through to the subject_key tiebreak.
  const orderA = rowA.sort_order
  const orderB = rowB.sort_order === rowA.sort_order ? rowA.sort_order + 1 : rowB.sort_order

  const first = await updateClassSubject(keyA, { sort_order: orderB }, classId)
  if (first.error) return first
  return updateClassSubject(keyB, { sort_order: orderA }, classId)
}

export interface NewClassSubject {
  label_km: string
  max_score: number
  score_type: TemplateScoreType
  /** Optional sub-columns, as the teacher typed them, comma separated. */
  column_labels?: string[]
}

/**
 * Add a subject that exists only for this class.
 *
 * The generated `subject_key` is what `scores.subject` will hold for every mark
 * entered against it, so it is minted once on the server, prefixed to keep it
 * clear of the national key space, and never reused or rewritten.
 */
export async function addClassSubject(
  input: NewClassSubject,
  classId?: string,
): Promise<ActionResult & { subjectKey?: string }> {
  const ctx = await classContext(classId)
  if ('error' in ctx) return { error: ctx.error }

  const label = input.label_km.trim()
  if (!label) return { error: 'សូមបញ្ចូលឈ្មោះមុខវិជ្ជា' }
  if (!(input.max_score > 0)) return { error: 'ពិន្ទុពេញត្រូវតែធំជាងសូន្យ' }

  const taken = new Set(ctx.rows.map((r) => r.subject_key))
  let subjectKey = ''
  do {
    subjectKey = `cls_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
  } while (taken.has(subjectKey))

  const labels = (input.column_labels ?? []).map((l) => l.trim()).filter(Boolean)
  const columns: SubjectColumn[] =
    labels.length > 0
      ? labels.map((l, i) => ({ id: `${subjectKey}_${i}`, label: l, width: '120px' }))
      // A single-column subject stores its marks under the subject key itself,
      // matching every seeded single-column subject in 00016.
      : [{ id: subjectKey, label, width: '120px' }]

  // New subjects go to the end of the list they belong to.
  const sameType = ctx.rows.filter((r) => r.score_types.includes(input.score_type))
  const sortOrder = sameType.reduce((max, r) => Math.max(max, r.sort_order), 0) + 10

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('score_template_subjects')
    .insert({
      scope: 'class',
      class_id: ctx.classId,
      subject_key: subjectKey,
      label_km: label,
      group_label: 'មុខវិជ្ជាថ្នាក់',
      columns,
      max_score: input.max_score,
      value_kind: 'numeric',
      score_types: [input.score_type],
      sort_order: sortOrder,
      hidden: false,
    })
    .select('id')
    .single()

  if (error) {
    logger.error(error)
    return { error: error.message }
  }

  await auditLog({
    action: 'score_template.created',
    entityType: 'score_template_subject',
    entityId: data.id,
    newValue: { subject_key: subjectKey, label_km: label, max_score: input.max_score },
    metadata: { class_id: ctx.classId, class_own: true },
    actorId: ctx.userId,
  })

  revalidatePath('/score/subjects')
  revalidatePath('/score/enter')
  return { success: true, subjectKey }
}

/**
 * Drop every customisation for this class.
 *
 * Deletes the class rows only. Nothing in `scores` is touched: marks recorded
 * against a subject this class invented keep their rows, they simply stop being
 * offered in the picker — which is why the confirmation has to say so.
 */
export async function resetClassTemplate(classId?: string): Promise<ActionResult & { removed?: number }> {
  const ctx = await classContext(classId)
  if ('error' in ctx) return { error: ctx.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('score_template_subjects')
    .delete()
    .eq('scope', 'class')
    .eq('class_id', ctx.classId)
    .select('id')

  if (error) {
    logger.error(error)
    return { error: error.message }
  }

  const removed = data?.length ?? 0
  if (removed > 0) {
    await auditLog({
      action: 'score_template.reset',
      entityType: 'score_template_subject',
      metadata: { class_id: ctx.classId, removed },
      actorId: ctx.userId,
    })
  }

  revalidatePath('/score/subjects')
  revalidatePath('/score/enter')
  return { success: true, removed }
}
