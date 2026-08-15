import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { RoleName } from '@/lib/types'

/**
 * Which of the three apps a signed-in account belongs to.
 *
 * THE DEFECT THIS EXISTS TO FIX
 * `getUserRoles()` ends with `if (roles.length === 0) roles.push('teacher')` —
 * correct for pre-V2 teacher accounts, which predate `user_roles` entirely.
 * But a parent has no `user_roles` row either, so that fallback silently
 * promoted every parent to teacher: signing in as a parent landed on the
 * teacher dashboard, with the principal's analytics tile on it.
 *
 * Being a parent is not the absence of a role — it is the presence of a
 * `parent_students` link. That is what this module keys on, so the legacy
 * fallback keeps working for the accounts it was written for.
 */

export type ActorKind = 'admin' | 'teacher' | 'parent'

export interface Actor {
  userId: string
  kind: ActorKind
  roles: RoleName[]
}

const ADMIN_ROLES: readonly string[] = ['owner', 'principal', 'school_admin']

/** Where an actor belongs when they land on `/` or finish signing in. */
export function homeRouteFor(kind: ActorKind): string {
  return kind === 'parent' ? '/parent/dashboard' : '/dashboard'
}

/**
 * Resolve the signed-in account's kind, or `null` when there is no session.
 *
 * Precedence, and the reasoning for each step:
 *
 *  1. An explicit `user_roles` row wins. It is the deliberate, administered
 *     answer, so nothing inferred should override it.
 *  2. A teaching signal beats a parent link. A teacher whose own child attends
 *     the school has both; they need the teacher app, and the parent portal is
 *     still reachable by URL.
 *  3. A `parent_students` link with no teaching signal means parent.
 *  4. Otherwise teacher — the legacy fallback, unchanged.
 */
export async function resolveActor(): Promise<Actor | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [roleRes, parentRes, ownedRes, assignedRes] = await Promise.all([
    supabase.from('user_roles').select('roles(name)').eq('user_id', user.id),
    supabase.from('parent_students').select('id').eq('parent_id', user.id).limit(1),
    supabase.from('students').select('id').eq('teacher_id', user.id).limit(1),
    supabase
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_id', user.id)
      .eq('status', 'active')
      .limit(1),
  ])

  const roles: RoleName[] = []
  for (const row of roleRes.data ?? []) {
    // PostgREST types an embedded to-one relation as an array.
    const rel = (row as { roles?: { name?: string } | { name?: string }[] }).roles
    const name = Array.isArray(rel) ? rel[0]?.name : rel?.name
    if (name) roles.push(name as RoleName)
  }

  if (roles.length > 0) {
    if (roles.some((r) => ADMIN_ROLES.includes(r))) return { userId: user.id, kind: 'admin', roles }
    if (roles.some((r) => r === 'parent')) return { userId: user.id, kind: 'parent', roles }
    return { userId: user.id, kind: 'teacher', roles }
  }

  const teaches = (ownedRes.data?.length ?? 0) > 0 || (assignedRes.data?.length ?? 0) > 0
  const parents = (parentRes.data?.length ?? 0) > 0

  if (parents && !teaches) return { userId: user.id, kind: 'parent', roles: ['parent' as RoleName] }

  return { userId: user.id, kind: 'teacher', roles: ['teacher'] }
}

/** True when the actor may open the principal's school-wide surfaces. */
export function isAdminActor(actor: Actor | null): boolean {
  return actor?.kind === 'admin'
}
