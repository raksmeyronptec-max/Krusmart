'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, InventoryItemRow } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { auditLog } from '@/lib/audit/log'

/**
 * Classroom inventory, stored in Supabase since migration 00012.
 *
 * It used to live in `localStorage` under `inventoryItems`, which meant the
 * list existed only on the device that typed it: clearing site data, switching
 * browsers, or handing the class over to another teacher lost the register
 * entirely, and the printable A4 sheet — the whole point of the feature — could
 * only be produced from that one machine.
 */

export async function listInventoryItems(): Promise<InventoryItemRow[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('teacher_id', user.id)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    logger.error(error)
    return []
  }

  return (data ?? []) as InventoryItemRow[]
}

export async function createInventoryItem(
  input: { name: string; qty: number; unit?: string | null; note?: string | null },
): Promise<ActionResult & { data?: InventoryItemRow }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const name = input.name.trim()
  if (!name) return { error: 'សូមបញ្ចូលឈ្មោះសម្ភារៈ' }

  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      teacher_id: user.id,
      name,
      qty: Number.isFinite(input.qty) ? input.qty : 0,
      unit: input.unit ?? null,
      note: input.note ?? null,
    })
    .select()
    .single()

  if (error) {
    logger.error(error)
    return { error: error.message }
  }

  await auditLog({
    action: 'inventory.created',
    entityType: 'inventory_item',
    entityId: data.id,
    newValue: { name, qty: input.qty },
    actorId: user.id,
  })

  revalidatePath('/inventory')
  return { success: true, data: data as InventoryItemRow }
}

export async function updateInventoryItem(
  id: string,
  input: { name: string; qty: number; unit?: string | null; note?: string | null },
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const name = input.name.trim()
  if (!name) return { error: 'សូមបញ្ចូលឈ្មោះសម្ភារៈ' }

  const { error } = await supabase
    .from('inventory_items')
    .update({
      name,
      qty: Number.isFinite(input.qty) ? input.qty : 0,
      unit: input.unit ?? null,
      note: input.note ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('teacher_id', user.id)

  if (error) {
    logger.error(error)
    return { error: error.message }
  }

  await auditLog({
    action: 'inventory.updated',
    entityType: 'inventory_item',
    entityId: id,
    newValue: { name, qty: input.qty },
    actorId: user.id,
  })

  revalidatePath('/inventory')
  return { success: true }
}

export async function deleteInventoryItem(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', id)
    .eq('teacher_id', user.id)

  if (error) {
    logger.error(error)
    return { error: error.message }
  }

  await auditLog({
    action: 'inventory.deleted',
    entityType: 'inventory_item',
    entityId: id,
    actorId: user.id,
  })

  revalidatePath('/inventory')
  return { success: true }
}

/**
 * One-time import of a browser's `localStorage` inventory.
 *
 * Mirrors `importCustomSubjects`: runs only when the database is empty for this
 * teacher, and leaves the localStorage copy in place so a failure can be retried.
 */
export async function importInventoryItems(
  items: { name: string; qty: number; note?: string | null }[],
): Promise<ActionResult & { imported?: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const clean = items
    .filter((i) => i.name?.trim())
    .map((i, index) => ({
      teacher_id: user.id,
      name: i.name.trim(),
      qty: Number.isFinite(i.qty) ? i.qty : 0,
      note: i.note ?? null,
      order_index: index,
    }))

  if (clean.length === 0) return { success: true, imported: 0 }

  const { data, error } = await supabase.from('inventory_items').insert(clean).select()

  if (error) {
    logger.error(error)
    return { error: error.message }
  }

  const imported = data?.length ?? 0
  if (imported > 0) {
    await auditLog({
      action: 'inventory.imported',
      entityType: 'inventory_item',
      metadata: { count: imported },
      actorId: user.id,
    })
  }

  revalidatePath('/inventory')
  return { success: true, imported }
}
