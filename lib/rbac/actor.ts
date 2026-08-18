import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { RoleName } from '@/lib/types'
import { type LoginRole } from '@/lib/auth/role-config'

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
}

const ADMIN_ROLES: readonly string[] = ['owner', 'principal', 'school_admin']

/**
 * A teacher who onboards themselves ends up holding `owner` on the school they
 * just created — that is what `create_teacher_organisation` (00017) grants, and
 * what every hierarchy write policy checks.
 *
 * Left alone, that role would misclassify them twice: `resolveActor` would call
 * them an admin and route them to the school console, and
 * `resolveAllAvailableRoles` would see two workspaces and send them to
 * `/login/choose-workspace` on *every* sign-in — asking a one-class teacher to
 * choose between "owner" and "teacher" forever.
 *
 * So an `owner` grant is only a real administrative workspace when the school
 * was not self-created. `schools.settings->>'self_serve'` is stamped by the
 * migration precisely to carry that distinction. When the flag cannot be read
 * (RLS hides the row, or the grant predates 00017) the school counts as a real
 * one — the safe direction, since it only ever preserves existing behaviour.
 */
interface RoleRow {
  school_id: string | null
  roles?: { name?: string } | { name?: string }[] | null
  schools?: { settings?: Record<string, unknown> | null } | { settings?: Record<string, unknown> | null }[] | null
}

const ROLE_SELECT = 'school_id, roles(name), schools(settings)'

/** PostgREST returns an embedded to-one relation as either an object or a 1-element array. */
function one<T>(rel: T | T[] | null | undefined): T | undefined {
  return Array.isArray(rel) ? rel[0] : (rel ?? undefined)
}

function isSelfServe(row: RoleRow): boolean {
  return one(row.schools)?.settings?.self_serve === true
}

function roleNameOf(row: RoleRow): string | undefined {
  return one(row.roles)?.name
}

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
    // the note on `isSelfServe`. The teacher entry is added below from the
    // assignment the same onboarding created.
    if (name === 'owner' && !isSelfServe(row)) available.add('owner')
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

  const roles: RoleName[] = []
  const selfServeSchoolIds: string[] = []
  /** Admin roles that came from a school the user did *not* create themselves. */
  const realAdminRoles: string[] = []

  for (const raw of roleRes.data ?? []) {
    const row = raw as RoleRow
    const name = roleNameOf(row)
    if (!name) continue
    roles.push(name as RoleName)

    const selfServe = name === 'owner' && isSelfServe(row)
    if (selfServe && row.school_id) selfServeSchoolIds.push(row.school_id)
    if (ADMIN_ROLES.includes(name) && !selfServe) realAdminRoles.push(name)
  }

  const hasAssignments = (assignedRes.data?.length ?? 0) > 0
  const hasLegacyRoster = (ownedRes.data?.length ?? 0) > 0
  const base = { userId: user.id, hasAssignments, hasLegacyRoster, selfServeSchoolIds }

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
