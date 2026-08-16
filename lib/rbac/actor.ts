import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { RoleName } from '@/lib/types'
import { type LoginRole } from '@/lib/auth/role-config'

export type ActorKind = 'admin' | 'teacher' | 'parent'

export interface Actor {
  userId: string
  kind: ActorKind
  roles: RoleName[]
}

const ADMIN_ROLES: readonly string[] = ['owner', 'principal', 'school_admin']

export function homeRouteFor(kind: ActorKind): string {
  return kind === 'parent' ? '/parent/dashboard' : '/dashboard'
}

export async function resolveAllAvailableRoles(): Promise<LoginRole[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

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

  const available: Set<LoginRole> = new Set()

  for (const row of roleRes.data ?? []) {
    const rel = (row as { roles?: { name?: string } | { name?: string }[] }).roles
    const name = Array.isArray(rel) ? rel[0]?.name : rel?.name
    if (name === 'owner') available.add('owner')
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

export function isAdminActor(actor: Actor | null): boolean {
  return actor?.kind === 'admin'
}
