import { createClient } from '@/lib/supabase/server'
import { classifyRoleRows, type RoleRow, ROLE_SELECT } from '@/lib/rbac/roleRows'
import { logger } from '@/lib/utils/logger'
import { OrganisationClient, type JoinRequestSummary } from './OrganisationClient'

export const metadata = { title: 'ជ្រើសរើសស្ថាប័ន | KruSmart' }

/**
 * Step 1 — the organisation (§7).
 *
 * Three situations arrive here, and the screen must tell them apart:
 *
 *   creator — a self-serve owner resuming setup. Their school is offered back
 *             ("Do not force teachers to recreate organisations") and the
 *             wizard continues; they hold `owner`, so every later write works.
 *   member  — a teacher whose join request was approved. They belong to a real
 *             school but hold only `teacher`, so the wizard's level/class
 *             writes would be refused by RLS — sending them onward would strand
 *             them on a form that cannot succeed. They see an
 *             awaiting-assignment card instead.
 *   new     — neither. They create an organisation or search for one to join.
 *
 * The distinction is `schools.settings->>'self_serve'`, read through the same
 * `classifyRoleRows` the router and the dashboard use, so all three surfaces
 * answer "whose school is this?" identically.
 */
export default async function OrganisationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let existing: { id: string; name: string } | null = null
  let membershipKind: 'creator' | 'member' | null = null
  let joinRequests: JoinRequestSummary[] = []

  if (user) {
    const [{ data: profile }, { data: roleRows }, requestsRes] = await Promise.all([
      supabase.from('profiles').select('school_id').eq('id', user.id).maybeSingle(),
      supabase.from('user_roles').select(ROLE_SELECT).eq('user_id', user.id),
      supabase.rpc('my_join_requests'),
    ])

    // Pre-00022 database: the RPC does not exist yet. The join flow simply has
    // no history to show — everything else on the step works.
    if (requestsRes.error) logger.error('my_join_requests:', requestsRes.error)
    joinRequests = (requestsRes.data ?? []) as JoinRequestSummary[]

    if (profile?.school_id) {
      const { data: school } = await supabase
        .from('schools')
        .select('id, name')
        .eq('id', profile.school_id)
        .maybeSingle()
      existing = school ?? null

      if (existing) {
        const classified = classifyRoleRows((roleRows ?? []) as RoleRow[])
        membershipKind = classified.selfServeSchoolIds.includes(existing.id)
          ? 'creator'
          : 'member'
      }
    }
  }

  return (
    <OrganisationClient
      existing={existing}
      membershipKind={membershipKind}
      joinRequests={joinRequests}
    />
  )
}
