import { getAdminScope, getAuditLogs } from '../queries'
import { AdminPage, EmptyState, NoSchool } from '../AdminPage'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

/**
 * Audit trail. Append-only at the database level: `audit_logs` has INSERT and
 * SELECT policies but deliberately no UPDATE or DELETE, so nothing shown here
 * can be rewritten through the API.
 */
export default async function AdminAuditLogsPage() {
  const scope = await getAdminScope()
  if (!scope) return <NoSchool />

  const logs = await getAuditLogs(scope, 200)

  return (
    <AdminPage
      title="កំណត់ហេតុសវនកម្ម"
      description={`កំណត់ហេតុចុងក្រោយ ${toKhmerNumber(logs.length)} ធាតុ`}
    >
      {logs.length === 0 ? (
        <EmptyState message="មិនទាន់មានកំណត់ហេតុទេ" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-divider bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-paper text-left">
              <tr>
                <th className="p-4 font-bold text-text-body">ពេលវេលា</th>
                <th className="p-4 font-bold text-text-body">សកម្មភាព</th>
                <th className="p-4 font-bold text-text-body">ប្រភេទ</th>
                <th className="p-4 font-bold text-text-body">លេខសម្គាល់</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-paper">
                  <td className="whitespace-nowrap p-4 text-xs text-text-muted">
                    {new Date(log.created_at).toLocaleString('km-KH')}
                  </td>
                  <td className="p-4 font-medium text-text-heading">{log.action}</td>
                  <td className="p-4 text-text-body">{log.entity_type}</td>
                  <td className="p-4 font-mono text-xs text-text-muted">{log.entity_id ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPage>
  )
}
