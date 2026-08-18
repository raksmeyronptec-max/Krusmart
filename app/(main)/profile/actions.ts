'use server'

/**
 * Per-section profile saves.
 *
 * The old client upserted the ENTIRE settings row from browser state on every
 * save, so two tabs (or two devices) silently clobbered each other's columns.
 * Each action here:
 *   - derives `teacher_id` from the server session — never from the payload;
 *   - validates through the shared Zod schema (lib/profile/schema.ts), which
 *     also whitelists exactly the columns the section owns, so a save can
 *     never overwrite another section's columns with stale client state;
 *   - detects stale writes via `updated_at` (last-write-wins after the client
 *     confirms — acceptable for a single-owner row, and said out loud here).
 *
 * PII discipline: nothing in this file logs field values. Errors log the
 * Postgres error only; audit entries carry the section id, never the data.
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/utils/logger'
import { auditLog } from '@/lib/audit/log'
import {
  PAIRED_SETTINGS_COLUMNS,
  SECTION_SCHEMAS,
  type SectionId,
} from '@/lib/profile/schema'

export type ProfileSaveResult = {
  success?: true
  error?: string
  /** Another device saved this row after the client loaded it. */
  conflict?: true
  /** The row's new `updated_at`, so the client can track staleness. */
  updatedAt?: string
}

/** '' → null so DATE columns accept the value and empty means empty. */
function nullifyEmpty(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) out[k] = v === '' ? null : v
  return out
}

export async function saveProfileSection(
  sectionId: SectionId,
  values: unknown,
  options?: { expectedUpdatedAt?: string | null; force?: boolean },
): Promise<ProfileSaveResult> {
  const schemas = SECTION_SCHEMAS[sectionId]
  if (!schemas) return { error: 'Unknown section' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Stale-write check on the shared settings row. Only sections that touch
  // `settings` care: `teacher_profiles` is only ever written by this page.
  if (schemas.settings && !options?.force) {
    const { data: current } = await supabase
      .from('settings')
      .select('updated_at')
      .eq('teacher_id', user.id)
      .maybeSingle()
    const expected = options?.expectedUpdatedAt ?? null
    // Compare as instants, not strings: PostgREST renders `+00:00` while the
    // client holds the `Z`-suffixed ISO it was handed back on its last save.
    if (
      current?.updated_at &&
      expected &&
      new Date(current.updated_at).getTime() !== new Date(expected).getTime()
    ) {
      return { conflict: true, error: 'ទិន្នន័យត្រូវបានកែប្រែពីឧបករណ៍ផ្សេង' }
    }
  }

  const input = (values ?? {}) as Record<string, unknown>
  const now = new Date().toISOString()
  let settingsUpdatedAt: string | undefined

  if (schemas.settings) {
    const parsed = schemas.settings.safeParse(input)
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'ទិន្នន័យមិនត្រឹមត្រូវ' }
    }
    const payload = nullifyEmpty(parsed.data as Record<string, unknown>)
    // Mirror the paired columns — writing one half is what broke printing
    // before 00013 (province_for_date vs province_date, etc.).
    for (const [main, twin] of Object.entries(PAIRED_SETTINGS_COLUMNS)) {
      if (main in payload) payload[twin] = payload[main]
    }
    const { error } = await supabase
      .from('settings')
      .upsert({ ...payload, teacher_id: user.id, updated_at: now }, { onConflict: 'teacher_id' })
    if (error) {
      logger.error('settings save failed:', error)
      return { error: error.message }
    }
    settingsUpdatedAt = now
  }

  if (schemas.profile) {
    const parsed = schemas.profile.safeParse(input)
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'ទិន្នន័យមិនត្រឹមត្រូវ' }
    }
    const payload = nullifyEmpty(parsed.data as Record<string, unknown>)
    const { error } = await supabase
      .from('teacher_profiles')
      .upsert({ ...payload, teacher_id: user.id, updated_at: now }, { onConflict: 'teacher_id' })
    if (error) {
      logger.error('teacher_profiles save failed:', error)
      // The settings half may already have committed with a fresh timestamp.
      // Return it so the client's next retry doesn't read its OWN write as a
      // phantom "edited from another device" conflict.
      return { error: error.message, updatedAt: settingsUpdatedAt }
    }
  }

  // Section id only — never the values (national IDs, DOB, family PII).
  await auditLog({
    action: `profile.section_saved.${sectionId}`,
    entityType: 'settings',
    entityId: user.id,
    actorId: user.id,
  })

  revalidatePath('/profile')
  return { success: true, updatedAt: settingsUpdatedAt }
}

/**
 * Password change with current-password reauthentication: the caller must
 * prove they hold the existing password before it is replaced, so a borrowed
 * open session cannot silently take over the account.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<ProfileSaveResult> {
  if (newPassword.length < 6) {
    return { error: 'ពាក្យសម្ងាត់ថ្មីត្រូវមានយ៉ាងតិច ៦ តួអក្សរ' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: 'Unauthorized' }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (reauthError) {
    return { error: 'ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវ' }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    logger.error('password change failed:', error)
    return { error: 'មិនអាចប្ដូរពាក្យសម្ងាត់បានទេ' }
  }

  await auditLog({
    action: 'profile.password_changed',
    entityType: 'auth',
    entityId: user.id,
    actorId: user.id,
  })

  return { success: true }
}
