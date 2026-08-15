import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { RoleName, TeacherAssignment } from '@/lib/types'
import { hasPermission, type Permission } from './permissions'

/**
 * Server-side authorization entry points.
 *
 * Split out of `./permissions` so that the permission matrix and its pure
 * predicates can be imported from client components. Everything here touches
 * cookies through the Supabase server client and must never reach a browser
 * bundle.
 *
 * These checks mirror the RLS policies from migration 00003. The database is
 * the source of truth at runtime; this module decides what the UI offers.
 */

export interface UserRoleContext {
  userId: string
  roles: RoleName[]
  /** Schools the user belongs to, via `user_roles` or their profile. */
  schoolIds: string[]
  /** Primary school — `profiles.school_id`, falling back to the first grant. */
  activeSchoolId: string | null
}

/**
 * Resolve the caller's roles and schools. Server-side only.
 *
 * Returns `null` when there is no session. A signed-in user with no `user_roles`
 * row is treated as a `teacher`, which is what every pre-V2 account is — this is
 * what keeps the legacy single-teacher app working before any RBAC is assigned.
 */
export async function getUserRoles(): Promise<UserRoleContext | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: roleRows }, { data: profile }] = await Promise.all([
    supabase.from('user_roles').select('school_id, roles(name)').eq('user_id', user.id),
    supabase.from('profiles').select('school_id').eq('id', user.id).maybeSingle(),
  ])

  const roles: RoleName[] = []
  const schoolIds = new Set<string>()

  for (const row of roleRows ?? []) {
    // PostgREST types an embedded to-one relation as an array.
    const rel = (row as { roles?: { name?: string } | { name?: string }[] }).roles
    const name = Array.isArray(rel) ? rel[0]?.name : rel?.name
    if (name) roles.push(name as RoleName)
    const sid = (row as { school_id?: string | null }).school_id
    if (sid) schoolIds.add(sid)
  }

  if (profile?.school_id) schoolIds.add(profile.school_id)

  // Legacy accounts predate user_roles entirely.
  if (roles.length === 0) roles.push('teacher')

  return {
    userId: user.id,
    roles,
    schoolIds: [...schoolIds],
    activeSchoolId: profile?.school_id ?? [...schoolIds][0] ?? null,
  }
}

/**
 * The caller's teaching assignments, newest academic year first.
 *
 * Returns `[]` for a teacher who has not been assigned yet — callers must treat
 * that as "fall back to the legacy `teacher_id` query path", not as "no access".
 */
export async function getTeacherAssignments(): Promise<TeacherAssignment[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('teacher_assignments')
    .select('*')
    .eq('teacher_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  return data ?? []
}

/**
 * Assert a permission inside a server action.
 *
 * Throws rather than returning a flag so a forgotten check cannot silently
 * proceed. RLS is still the real boundary; this produces a clear Khmer error
 * instead of an opaque empty result.
 */
export async function requirePermission(permission: Permission): Promise<UserRoleContext> {
  const ctx = await getUserRoles()
  if (!ctx) throw new Error('សូមចូលគណនីជាមុនសិន')
  if (!hasPermission(ctx.roles, permission)) {
    throw new Error('អ្នកមិនមានសិទ្ធិសម្រាប់សកម្មភាពនេះទេ')
  }
  return ctx
}
