'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { hasPermission, type Permission } from './permissions'
import { classifyRoleRows, ROLE_SELECT, type RoleRow } from './roleRows'
import { logger } from '@/lib/utils/logger'
import type { RoleName } from '@/lib/types'

export interface UseUserRoleResult {
  /** Null until the first fetch resolves. */
  userId: string | null
  roles: RoleName[]
  schoolIds: string[]
  activeSchoolId: string | null
  /** Schools this user owns *because they created them through onboarding*. */
  selfServeSchoolIds: string[]
  loading: boolean
  /** `can('scores:update')` */
  can: (permission: Permission) => boolean
  /**
   * True for a *real* administrator — owner / principal / school_admin on a
   * school the user did not create themselves.
   *
   * This used to be `isSchoolAdmin(roles)`, which said yes to every teacher who
   * onboarded through `/onboarding`: `create_teacher_organisation` grants them
   * `owner` on their own school, and the query here never fetched
   * `schools.settings` to tell the two apart. `resolveActor` on the server has
   * always drawn that line — see `classifyRoleRows` — so the dashboard was
   * offering admin-only tiles to people sign-in deliberately routes into the
   * teacher app.
   *
   * Note this is narrower than `can()` on purpose. RLS really does accept a
   * self-serve owner's writes, so capabilities are unchanged; only
   * classification moved.
   */
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
  const [selfServeSchoolIds, setSelfServeSchoolIds] = useState<string[]>([])
  const [realAdmin, setRealAdmin] = useState(false)
  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setUserId(null)
        setRoles([])
        setSchoolIds([])
        setSelfServeSchoolIds([])
        setRealAdmin(false)
        setActiveSchoolId(null)
        return
      }
      setUserId(user.id)

      const [{ data: roleRows, error: roleErr }, { data: profile }] = await Promise.all([
        supabase.from('user_roles').select(ROLE_SELECT).eq('user_id', user.id),
        supabase.from('profiles').select('school_id').eq('id', user.id).maybeSingle(),
      ])

      if (roleErr) logger.error('Failed to load user roles:', roleErr)

      const classified = classifyRoleRows((roleRows ?? []) as RoleRow[])
      const nextRoles = classified.roles as RoleName[]
      const nextSchools = new Set<string>(classified.schoolIds)

      if (profile?.school_id) nextSchools.add(profile.school_id)
      // Legacy accounts predate user_roles entirely — same fallback as
      // `getUserRoles` on the server, and what keeps pre-V2 accounts working.
      if (nextRoles.length === 0) nextRoles.push('teacher')

      setRoles(nextRoles)
      setRealAdmin(classified.realAdminRoles.length > 0)
      setSelfServeSchoolIds(classified.selfServeSchoolIds)
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
    selfServeSchoolIds,
    loading,
    can,
    isAdmin: realAdmin,
    refresh: load,
  }
}
