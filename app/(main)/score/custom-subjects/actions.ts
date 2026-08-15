'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, CustomSubjectRow, CustomSubjectScope } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { auditLog } from '@/lib/audit/log'

/**
 * Teacher-defined subjects, stored in Supabase since migration 00012.
 *
 * They used to live in `localStorage` under `custom_subjects`, which meant a
 * teacher who opened the app on a second device saw their extra subjects
 * disappear — while the *scores* recorded against them stayed in the database,
 * rendering as bare column keys with no heading. The parent portal had the same
 * problem from the other side: it can read a child's marks but never had access
 * to the browser that defined the subject.
 *
 * `columns` keeps the legacy JSON shape verbatim, including each column's `id`.
 * That matters: those ids are what `scores.subject` holds, so rewriting them
 * would orphan every mark already entered.
 */

/** Every custom subject belonging to the signed-in teacher. */
export async function listCustomSubjects(): Promise<CustomSubjectRow[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('custom_subjects')
    .select('*')
    .eq('teacher_id', user.id)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    logger.error(error)
    return []
  }

  return (data ?? []) as CustomSubjectRow[]
}

export async function createCustomSubject(
  name: string,
  scope: CustomSubjectScope,
  columns: { id: string; label: string; width?: string }[],
): Promise<ActionResult & { data?: CustomSubjectRow }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'សូមបញ្ចូលឈ្មោះមុខវិជ្ជា' }

  const { data, error } = await supabase
    .from('custom_subjects')
    .insert({ teacher_id: user.id, name: trimmed, scope, columns })
    .select()
    .single()

  if (error) {
    // The partial unique index in 00012 makes a duplicate name a 23505 rather
    // than a second, confusing row in the picker.
    if (error.code === '23505') return { error: 'មុខវិជ្ជានេះមានរួចហើយ' }
    logger.error(error)
    return { error: error.message }
  }

  await auditLog({
    action: 'custom_subject.created',
    entityType: 'custom_subject',
    entityId: data.id,
    newValue: { name: trimmed, scope },
    actorId: user.id,
  })

  revalidatePath('/score/enter')
  revalidatePath('/score/total')
  return { success: true, data: data as CustomSubjectRow }
}

export async function deleteCustomSubject(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // `.eq('teacher_id')` duplicates what RLS already enforces — the convention
  // throughout this codebase, and a second guard on a destructive path.
  const { error } = await supabase
    .from('custom_subjects')
    .delete()
    .eq('id', id)
    .eq('teacher_id', user.id)

  if (error) {
    logger.error(error)
    return { error: error.message }
  }

  await auditLog({
    action: 'custom_subject.deleted',
    entityType: 'custom_subject',
    entityId: id,
    actorId: user.id,
  })

  revalidatePath('/score/enter')
  revalidatePath('/score/total')
  return { success: true }
}

/**
 * One-time import of a browser's `localStorage` subjects.
 *
 * Called by the score clients when the teacher has rows in `localStorage` but
 * none in Supabase — the situation for every account that used the app before
 * this migration. Deliberately *not* destructive: the localStorage copy is left
 * alone, so a failed import can simply be retried, and an older build of the
 * app running in another tab keeps working.
 *
 * Duplicate names are skipped rather than failing the whole batch: a teacher
 * who signs in on two devices should not get an error on the second one.
 */
export async function importCustomSubjects(
  subjects: { name: string; scope: CustomSubjectScope; columns: { id: string; label: string; width?: string }[] }[],
): Promise<ActionResult & { imported?: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const clean = subjects
    .filter((s) => s.name?.trim())
    .map((s, i) => ({
      teacher_id: user.id,
      name: s.name.trim(),
      scope: s.scope,
      columns: s.columns ?? [],
      order_index: i,
    }))

  if (clean.length === 0) return { success: true, imported: 0 }

  const { data, error } = await supabase
    .from('custom_subjects')
    .upsert(clean, { onConflict: 'teacher_id, name', ignoreDuplicates: true })
    .select()

  if (error) {
    logger.error(error)
    return { error: error.message }
  }

  const imported = data?.length ?? 0
  if (imported > 0) {
    await auditLog({
      action: 'custom_subject.imported',
      entityType: 'custom_subject',
      metadata: { count: imported },
      actorId: user.id,
    })
  }

  revalidatePath('/score/enter')
  revalidatePath('/score/total')
  return { success: true, imported }
}
