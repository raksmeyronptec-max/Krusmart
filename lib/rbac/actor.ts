import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { RoleName } from '@/lib/types'
import { type LoginRole } from '@/lib/auth/role-config'
import {
  classifyRoleRows,
  isSelfServeOwner,
  roleNameOf,
  ROLE_SELECT,
  type RoleRow,
} from './roleRows'

export type ActorKind = 'admin' | 'teacher' | 'parent'

export interface Actor {
  userId: string
  kind: ActorKind
  roles: RoleName[]
  /**
   * Active `teacher_assignments` exist, so the v2 class-scoped path is live for
   * this account. False means every feature falls back to `teacher_id` scope.
   */
  hasAssignments: boolean
  /** Pre-V2 roster keyed on `students.teacher_id` — data an upgrade must preserve. */
  hasLegacyRoster: boolean
  /** Schools this user owns *because they created them through onboarding*. */
  selfServeSchoolIds: string[]
  /**
   * Every school this user holds any role in — including one they merely
   * joined. What separates an approved joiner (belongs somewhere, waits for an
   * admin to assign a class) from a brand-new account (belongs nowhere, must
   * be sent to onboarding). Superset of `selfServeSchoolIds`.
   */
  memberSchoolIds: string[]
}

/*
 * `ADMIN_ROLES`, `RoleRow`, `ROLE_SELECT`, `one`, `isSelfServeOwner` and
 * `roleNameOf` moved to `./roleRows`, which is pure. `useUserRole` on the
 * client asks the same question and used to answer it differently — it selected
 * `roles(name)` without `schools(settings)`, so a teacher who onboarded
 * themselves was a plain teacher here and an administrator there. Sharing the
 * projection and the predicate is what stops that recurring.
 */

export function homeRouteFor(kind: ActorKind): string {
  return kind === 'parent' ? '/parent/dashboard' : '/dashboard'
}

export async function resolveAllAvailableRoles(): Promise<LoginRole[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const [roleRes, parentRes, ownedRes, assignedRes] = await Promise.all([
    supabase.from('user_roles').select(ROLE_SELECT).eq('user_id', user.id),
    supabase.from('parent_students').select('id').eq('parent_id', user.id).limit(1),
    supabase.from('students').select('id').eq('teacher_id', user.id).limit(1),
    supabase
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_id', user.id)
      .eq('status', 'active')
      .limit(1),
  ])

  const available: Set<LoginRole> = new Set()

  for (const raw of roleRes.data ?? []) {
    const row = raw as RoleRow
    const name = roleNameOf(row)
    // A self-created school is not a second workspace to choose between; see
    // the note on `isSelfServeOwner`. The teacher entry is added below from the
    // assignment the same onboarding created.
    if (name === 'owner' && !isSelfServeOwner(row)) available.add('owner')
    if (name === 'principal' || name === 'school_admin') available.add('admin')
    if (name === 'parent') available.add('parent')
    if (name === 'teacher') available.add('teacher')
  }

  const teaches = (ownedRes.data?.length ?? 0) > 0 || (assignedRes.data?.length ?? 0) > 0
  const parents = (parentRes.data?.length ?? 0) > 0

  if (teaches) available.add('teacher')
  if (parents) available.add('parent')

  // Legacy fallback: if absolutely no roles are defined but they authenticated
  if (available.size === 0) {
    available.add('teacher')
  }

  return Array.from(available)
}

export async function resolveActor(): Promise<Actor | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [roleRes, parentRes, ownedRes, assignedRes] = await Promise.all([
    supabase.from('user_roles').select(ROLE_SELECT).eq('user_id', user.id),
    supabase.from('parent_students').select('id').eq('parent_id', user.id).limit(1),
    supabase.from('students').select('id').eq('teacher_id', user.id).limit(1),
    supabase
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_id', user.id)
      .eq('status', 'active')
      .limit(1),
  ])

  // `realAdminRoles` excludes an `owner` grant on a school the user created
  // themselves; `roles` keeps it, because RLS does.
  const classified = classifyRoleRows((roleRes.data ?? []) as RoleRow[])
  const roles = classified.roles as RoleName[]
  const { realAdminRoles, selfServeSchoolIds, schoolIds: memberSchoolIds } = classified

  const hasAssignments = (assignedRes.data?.length ?? 0) > 0
  const hasLegacyRoster = (ownedRes.data?.length ?? 0) > 0
  const base = { userId: user.id, hasAssignments, hasLegacyRoster, selfServeSchoolIds, memberSchoolIds }

  if (roles.length > 0) {
    // A self-serve owner is deliberately *not* an admin actor: they belong in
    // the teacher app they onboarded into. `/admin` still opens to them if they
    // navigate there — RLS and the admin layout both accept the owner role —
    // it simply is not where sign-in sends them.
    if (realAdminRoles.length > 0) return { ...base, kind: 'admin', roles }
    if (roles.some((r) => r === 'parent')) return { ...base, kind: 'parent', roles }
    return { ...base, kind: 'teacher', roles }
  }

  const teaches = hasLegacyRoster || hasAssignments
  const parents = (parentRes.data?.length ?? 0) > 0

  if (parents && !teaches) return { ...base, kind: 'parent', roles: ['parent' as RoleName] }

  return { ...base, kind: 'teacher', roles: ['teacher'] }
}

export function isAdminActor(actor: Actor | null): boolean {
  return actor?.kind === 'admin'
}
