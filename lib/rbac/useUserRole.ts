'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { hasPermission, isSchoolAdmin, type Permission } from './permissions'
import { logger } from '@/lib/utils/logger'
import type { RoleName } from '@/lib/types'

export interface UseUserRoleResult {
  /** Null until the first fetch resolves. */
  userId: string | null
  roles: RoleName[]
  schoolIds: string[]
  activeSchoolId: string | null
  loading: boolean
  /** `can('scores:update')` */
  can: (permission: Permission) => boolean
  /** True for owner / principal / school_admin. */
  isAdmin: boolean
  refresh: () => Promise<void>
}

/**
 * The signed-in user's roles and permissions, for conditional rendering.
 *
 * Client-side convenience only — it decides what to *show*. Authorization is
 * enforced by RLS and by `requirePermission` in server actions. A user who
 * tampers with this gains nothing.
 *
 * A signed-in user with no `user_roles` row resolves to `['teacher']`, matching
 * `getUserRoles` on the server and keeping pre-V2 accounts working.
 */
export function useUserRole(): UseUserRoleResult {
  const supabase = useMemo(() => createClient(), [])

  const [userId, setUserId] = useState<string | null>(null)
  const [roles, setRoles] = useState<RoleName[]>([])
  const [schoolIds, setSchoolIds] = useState<string[]>([])
  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setUserId(null)
        setRoles([])
        setSchoolIds([])
        setActiveSchoolId(null)
        return
      }
      setUserId(user.id)

      const [{ data: roleRows, error: roleErr }, { data: profile }] = await Promise.all([
        supabase.from('user_roles').select('school_id, roles(name)').eq('user_id', user.id),
        supabase.from('profiles').select('school_id').eq('id', user.id).maybeSingle(),
      ])

      if (roleErr) logger.error('Failed to load user roles:', roleErr)

      const nextRoles: RoleName[] = []
      const nextSchools = new Set<string>()

      for (const row of roleRows ?? []) {
        const rel = (row as { roles?: { name?: string } | { name?: string }[] }).roles
        const name = Array.isArray(rel) ? rel[0]?.name : rel?.name
        if (name) nextRoles.push(name as RoleName)
        const sid = (row as { school_id?: string | null }).school_id
        if (sid) nextSchools.add(sid)
      }

      if (profile?.school_id) nextSchools.add(profile.school_id)
      if (nextRoles.length === 0) nextRoles.push('teacher')

      setRoles(nextRoles)
      setSchoolIds([...nextSchools])
      setActiveSchoolId(profile?.school_id ?? [...nextSchools][0] ?? null)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const can = useCallback(
    (permission: Permission) => hasPermission(roles, permission),
    [roles],
  )

  return {
    userId,
    roles,
    schoolIds,
    activeSchoolId,
    loading,
    can,
    isAdmin: isSchoolAdmin(roles),
    refresh: load,
  }
}
