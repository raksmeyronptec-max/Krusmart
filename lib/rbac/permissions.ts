/**
 * Permission vocabulary and the pure checks over it.
 *
 * Deliberately free of any server-only import. `useUserRole` is a client hook
 * that needs `hasPermission` and `isSchoolAdmin`; while those lived beside
 * `getUserRoles` — which pulls in `lib/supabase/server`, and through it
 * `next/headers` — importing the hook from a client component failed the build.
 * The hook was consequently never used anywhere. Server-side entry points live
 * in `./server`.
 *
 * This module is the *source of truth in code*; the database is the source of
 * truth at runtime. Every check here mirrors an RLS policy from migration
 * 00003 — the UI uses these to decide what to render, and RLS independently
 * enforces the same rule on the data. Never rely on this module alone.
 */

import type { RoleName } from '@/lib/types'

/** Things a permission can be granted over. */
export type Resource =
  | 'students'
  | 'scores'
  | 'attendance'
  | 'classes'
  | 'subjects'
  | 'teachers'
  | 'enrollments'
  | 'assessments'
  | 'report_cards'
  | 'grading'
  | 'announcements'
  | 'audit_logs'
  | 'school_settings'
  | 'academic_years'

/** What can be done to a resource. */
export type Action = 'view' | 'create' | 'update' | 'delete' | 'approve' | 'export'

/** `'scores:update'` — the form used throughout the UI. */
export type Permission = `${Resource}:${Action}`

const ALL: Action[] = ['view', 'create', 'update', 'delete', 'approve', 'export']
const READ_ONLY: Action[] = ['view', 'export']

function grant(resources: Resource[], actions: Action[]): Permission[] {
  return resources.flatMap((r) => actions.map((a) => `${r}:${a}` as Permission))
}

/**
 * Baseline capability per role.
 *
 * A teacher's grants are further narrowed by their `teacher_assignments`: the
 * matrix says *what* they may do, RLS decides *which rows* they may do it to.
 */
const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  owner: grant(
    ['students','scores','attendance','classes','subjects','teachers','enrollments',
     'assessments','report_cards','grading','announcements','audit_logs',
     'school_settings','academic_years'],
    ALL,
  ),

  principal: grant(
    ['students','scores','attendance','classes','subjects','teachers','enrollments',
     'assessments','report_cards','grading','announcements','audit_logs',
     'school_settings','academic_years'],
    ALL,
  ),

  school_admin: [
    ...grant(
      ['students','classes','subjects','teachers','enrollments','assessments',
       'grading','announcements','academic_years'],
      ALL,
    ),
    ...grant(['scores','attendance','report_cards','audit_logs'], READ_ONLY),
  ],

  teacher: [
    ...grant(['scores','attendance'], ['view','create','update','delete','export']),
    ...grant(['students','enrollments'], ['view','create','update','export']),
    ...grant(['assessments','report_cards'], ['view','create','update','export']),
    ...grant(['classes','subjects','announcements','academic_years'], READ_ONLY),
  ],

  staff: grant(['students','classes','announcements'], READ_ONLY),

  parent: grant(['scores','attendance','report_cards','announcements'], ['view']),

  student: grant(['scores','attendance','report_cards','announcements'], ['view']),
}

/** Every permission the given roles confer, de-duplicated. */
export function permissionsForRoles(roles: RoleName[]): Set<Permission> {
  const out = new Set<Permission>()
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) out.add(p)
  }
  return out
}

/** Whether `roles` confer `permission`. Pure — safe on both client and server. */
export function hasPermission(roles: RoleName[], permission: Permission): boolean {
  return permissionsForRoles(roles).has(permission)
}

/** True when any role administers a school rather than a single classroom. */
export function isSchoolAdmin(roles: RoleName[]): boolean {
  return roles.some((r) => r === 'owner' || r === 'principal' || r === 'school_admin')
}

/** What `getUserRoles` resolves for the signed-in user. */
