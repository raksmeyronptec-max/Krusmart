'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, ClassAdminEntry } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { auditLog } from '@/lib/audit/log'
import { BOOK_IDS } from '@/lib/class-admin/books'
import { resolveServerScope } from '@/lib/utils/serverScope'

/**
 * CRUD for the 13 class-administration books.
 *
 * All 13 share one table (`class_admin_entries`, migration 00012) discriminated
 * by `book`, so these four actions replace what the legacy build implemented
 * separately in each of 13 HTML pages.
 *
 * `book` is validated against `BOOK_IDS` on every write. RLS already confines a
 * row to its owner, but nothing in the database constrains the discriminator —
 * without this check a typo (or a crafted request) would file a row under a book
 * that no page lists, where the teacher could never see or delete it again.
 */

function isKnownBook(book: string): boolean {
  return BOOK_IDS.includes(book)
}

export async function listBookEntries(book: string): Promise<ClassAdminEntry[]> {
  if (!isKnownBook(book)) return []

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('class_admin_entries')
    .select('*')
    .eq('teacher_id', user.id)
    .eq('book', book)
    .order('seq', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    logger.error(error)
    return []
  }

  return (data ?? []) as ClassAdminEntry[]
}

export async function createBookEntry(
  book: string,
  data: Record<string, unknown>,
): Promise<ActionResult & { data?: ClassAdminEntry }> {
  if (!isKnownBook(book)) return { error: 'សៀវភៅមិនត្រឹមត្រូវ' }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Stamp the V2 columns so the entry joins the class structure; a pre-V2
  // account resolves to `legacy` and simply stores nulls, exactly as before.
  const scope = await resolveServerScope(user.id)
  const scopeCols = scope.mode === 'v2'
    ? { class_id: scope.classId, academic_year_id: scope.academicYearId }
    : {}

  // Append: one past the highest existing seq for this book.
  const { data: last } = await supabase
    .from('class_admin_entries')
    .select('seq')
    .eq('teacher_id', user.id)
    .eq('book', book)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle()

  const entryDate = typeof data.date === 'string' && data.date ? data.date : null

  const { data: row, error } = await supabase
    .from('class_admin_entries')
    .insert({
      ...scopeCols,
      teacher_id: user.id,
      book,
      entry_date: entryDate,
      seq: (last?.seq ?? -1) + 1,
      data,
    })
    .select()
    .single()

  if (error) {
    logger.error(error)
    return { error: error.message }
  }

  await auditLog({
    action: 'class_admin.created',
    entityType: 'class_admin_entry',
    entityId: row.id,
    metadata: { book },
    actorId: user.id,
  })

  revalidatePath(`/class-admin/${book}`)
  return { success: true, data: row as ClassAdminEntry }
}

export async function updateBookEntry(
  id: string,
  book: string,
  data: Record<string, unknown>,
): Promise<ActionResult> {
  if (!isKnownBook(book)) return { error: 'សៀវភៅមិនត្រឹមត្រូវ' }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const entryDate = typeof data.date === 'string' && data.date ? data.date : null

  const { error } = await supabase
    .from('class_admin_entries')
    .update({ data, entry_date: entryDate, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('teacher_id', user.id)

  if (error) {
    logger.error(error)
    return { error: error.message }
  }

  await auditLog({
    action: 'class_admin.updated',
    entityType: 'class_admin_entry',
    entityId: id,
    metadata: { book },
    actorId: user.id,
  })

  revalidatePath(`/class-admin/${book}`)
  return { success: true }
}

export async function deleteBookEntry(id: string, book: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('class_admin_entries')
    .delete()
    .eq('id', id)
    .eq('teacher_id', user.id)

  if (error) {
    logger.error(error)
    return { error: error.message }
  }

  await auditLog({
    action: 'class_admin.deleted',
    entityType: 'class_admin_entry',
    entityId: id,
    metadata: { book },
    actorId: user.id,
  })

  revalidatePath(`/class-admin/${book}`)
  return { success: true }
}

/** Row counts per book, for the badges on the index page. */
export async function countBookEntries(): Promise<Record<string, number>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const { data, error } = await supabase
    .from('class_admin_entries')
    .select('book')
    .eq('teacher_id', user.id)

  if (error) {
    logger.error(error)
    return {}
  }

  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as { book: string }[]) {
    counts[row.book] = (counts[row.book] ?? 0) + 1
  }
  return counts
}
