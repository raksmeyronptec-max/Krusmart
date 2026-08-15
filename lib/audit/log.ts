import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

/**
 * Append-only audit trail for sensitive operations.
 *
 * `audit_logs` has INSERT and SELECT policies but deliberately no UPDATE or
 * DELETE, so entries cannot be rewritten through PostgREST. Inserts are checked
 * against `actor_id = auth.uid()`; a caller cannot forge another user's action.
 */

/** `<entity>.<verb>` — e.g. `score.updated`, `student.deleted`. */
export type AuditAction =
  | 'score.created' | 'score.updated' | 'score.deleted'
  | 'attendance.created' | 'attendance.updated'
  | 'student.created' | 'student.updated' | 'student.deleted' | 'student.imported'
  | 'enrollment.created' | 'enrollment.promoted' | 'enrollment.transferred' | 'enrollment.withdrawn'
  | 'class.created' | 'class.updated' | 'class.deleted'
  | 'teacher_assignment.created' | 'teacher_assignment.deleted'
  | 'settings.updated'
  | 'report_card.published'
  | (string & {})

export interface AuditLogInput {
  action: AuditAction
  entityType: string
  entityId?: string | null
  /** Omit on create; on update pass only the fields that changed. */
  oldValue?: Record<string, unknown> | null
  newValue?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  /** Defaults to the actor's `profiles.school_id`. */
  schoolId?: string | null
  /**
   * The acting user's id. Every caller already has it from its own auth guard,
   * so passing it skips a `getUser()` round-trip. It must still equal
   * `auth.uid()` — the RLS policy on `audit_logs` checks that independently, so
   * this is a performance hint, not a trust boundary.
   */
  actorId?: string
}

/**
 * Record an action. Never throws.
 *
 * Auditing must not be able to fail a user's operation — a lost log line is
 * better than a lost score. Failures go to the dev logger and are swallowed.
 * Call it *after* the mutation succeeds.
 */
export async function auditLog(input: AuditLogInput): Promise<void> {
  try {
    const supabase = await createClient()

    let actorId = input.actorId
    if (!actorId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      actorId = user.id
    }

    let schoolId = input.schoolId ?? null
    if (schoolId === null) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('school_id')
        .eq('id', actorId)
        .maybeSingle()
      schoolId = profile?.school_id ?? null
    }

    const { error } = await supabase.from('audit_logs').insert({
      school_id: schoolId,
      actor_id: actorId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
      metadata: input.metadata ?? {},
    })

    if (error) logger.error('auditLog insert failed:', error)
  } catch (error) {
    logger.error('auditLog threw:', error)
  }
}

/**
 * Log one action per entity in a batch (bulk score saves, roster imports).
 * Summarises rather than writing a row per record.
 */
export async function auditLogBatch(
  action: AuditAction,
  entityType: string,
  count: number,
  metadata?: Record<string, unknown>,
  actorId?: string,
): Promise<void> {
  await auditLog({
    action,
    entityType,
    entityId: null,
    metadata: { ...metadata, count },
    actorId,
  })
}
