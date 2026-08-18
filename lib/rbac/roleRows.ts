/**
 * Reading a `user_roles` row the same way on both sides of the wire.
 *
 * `resolveActor` (server) and `useUserRole` (client) both ask "is this person an
 * administrator?" and, until this module existed, answered differently: the
 * server excluded self-created schools, the client did not, because the client's
 * query never selected `schools(settings)` in the first place. A teacher who
 * onboarded themselves was a plain teacher to the router and an admin to the
 * dashboard.
 *
 * The predicates live here, pure and free of `server-only` imports, so the two
 * callers physically cannot drift again. The select string is exported too — the
 * bug was in the *projection*, not the logic, and a shared predicate over a
 * different set of columns would have repeated it.
 */

/** Columns both callers need. Selecting less is what caused the divergence. */
export const ROLE_SELECT = 'school_id, roles(name), schools(settings)'

export const ADMIN_ROLES: readonly string[] = ['owner', 'principal', 'school_admin']

export interface RoleRow {
  school_id: string | null
  roles?: { name?: string } | { name?: string }[] | null
  schools?:
    | { settings?: Record<string, unknown> | null }
    | { settings?: Record<string, unknown> | null }[]
    | null
}

/** PostgREST returns an embedded to-one relation as either an object or a 1-element array. */
export function one<T>(rel: T | T[] | null | undefined): T | undefined {
  return Array.isArray(rel) ? rel[0] : (rel ?? undefined)
}

/**
 * True when this grant is `owner` on a school the user created themselves.
 *
 * A teacher who onboards themselves ends up holding `owner` on the school they
 * just created — that is what `create_teacher_organisation` (00017) grants, and
 * what every hierarchy write policy checks. Left alone, that role would call a
 * one-class teacher an administrator.
 *
 * `schools.settings->>'self_serve'` is stamped by the migration precisely to
 * carry the distinction. When the flag cannot be read (RLS hides the row, or the
 * grant predates 00017) the school counts as a real one — the safe direction,
 * since it only ever preserves existing behaviour.
 */
export function isSelfServeOwner(row: RoleRow): boolean {
  return roleNameOf(row) === 'owner' && one(row.schools)?.settings?.self_serve === true
}

export function roleNameOf(row: RoleRow): string | undefined {
  return one(row.roles)?.name
}

/**
 * Split role rows into what the two questions need.
 *
 * `roles` keeps every grant, including a self-serve `owner` — capabilities are
 * unchanged, and RLS genuinely does accept that owner role, so `can()` must not
 * become more restrictive than the database.
 *
 * `realAdminRoles` is the narrower answer used for *classification*: which
 * workspace this person belongs in, and whether to offer them admin-only
 * surfaces. That is the one a self-created school must not satisfy.
 */
export function classifyRoleRows(rows: RoleRow[]): {
  roles: string[]
  realAdminRoles: string[]
  schoolIds: string[]
  selfServeSchoolIds: string[]
} {
  const roles: string[] = []
  const realAdminRoles: string[] = []
  const schoolIds: string[] = []
  const selfServeSchoolIds: string[] = []

  for (const row of rows) {
    const name = roleNameOf(row)
    if (!name) continue
    roles.push(name)

    const selfServe = isSelfServeOwner(row)
    if (selfServe && row.school_id) selfServeSchoolIds.push(row.school_id)
    if (ADMIN_ROLES.includes(name) && !selfServe) realAdminRoles.push(name)

    if (row.school_id) schoolIds.push(row.school_id)
  }

  return { roles, realAdminRoles, schoolIds, selfServeSchoolIds }
}
