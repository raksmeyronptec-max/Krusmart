import { createClient } from '@/lib/supabase/server'
import { Clock } from 'lucide-react'
import { getAdminScope } from '../queries'
import { AdminPage, NoSchool } from '../AdminPage'
import { DecisionButtons } from './DecisionButtons'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { formatKhmerDate } from '@/lib/utils/date'

/**
 * សំណើចូលរួម — teachers asking to join this school (migration 00022).
 *
 * RLS already limits the rows to schools the caller administers; the explicit
 * `school_id` filter is the project's usual second guard. Requester identity
 * comes from `profiles` (admin-readable since 00008) in a second query —
 * `join_requests.user_id` references auth.users, so PostgREST cannot embed the
 * profile relation.
 *
 * Approval grants exactly the `teacher` role and stamps a home school only if
 * the teacher has none. It gives no class access: that still arrives as an
 * assignment on the teachers screen, which is deliberately the very next thing
 * an admin does after approving.
 */
export default async function AdminJoinRequestsPage() {
  const scope = await getAdminScope()
  if (!scope) return <NoSchool />

  const supabase = await createClient()
  const { data: requests } = await supabase
    .from('join_requests')
    .select('id, user_id, status, message, created_at')
    .eq('school_id', scope.schoolId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const rows = requests ?? []
  const userIds = [...new Set(rows.map((r) => r.user_id))]

  const profiles = new Map<string, { full_name: string | null; phone: string | null }>()
  if (userIds.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', userIds)
    for (const p of data ?? []) profiles.set(p.id, p)
  }

  return (
    <AdminPage
      title="សំណើចូលរួមស្ថាប័ន"
      description={`សំណើកំពុងរង់ចាំ ${toKhmerNumber(rows.length)}`}
    >
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-divider bg-bg-surface px-6 py-12 text-center">
          <Clock className="h-8 w-8 text-text-muted" aria-hidden="true" />
          <p className="font-bold text-text-heading">មិនមានសំណើថ្មីទេ</p>
          <p className="max-w-sm text-sm text-text-muted">
            នៅពេលគ្រូស្នើសុំចូលរួមស្ថាប័ននេះ សំណើនឹងបង្ហាញនៅទីនេះ។
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((request) => {
            const profile = profiles.get(request.user_id)
            return (
              <li
                key={request.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-divider bg-bg-surface p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-text-heading">
                    {profile?.full_name || 'គ្រូបង្រៀន (មិនទាន់មានឈ្មោះ)'}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-text-muted">
                    {profile?.phone && <span>{profile.phone}</span>}
                    <span>ស្នើនៅ {formatKhmerDate(request.created_at)}</span>
                  </p>
                  {request.message && (
                    <p className="mt-1.5 rounded-lg bg-paper px-3 py-2 text-xs text-text-body">
                      {request.message}
                    </p>
                  )}
                </div>

                <DecisionButtons requestId={request.id} />
              </li>
            )
          })}
        </ul>
      )}
    </AdminPage>
  )
}
