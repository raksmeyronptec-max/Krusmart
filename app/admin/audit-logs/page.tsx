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
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-4 font-bold text-gray-700">ពេលវេលា</th>
                <th className="p-4 font-bold text-gray-700">សកម្មភាព</th>
                <th className="p-4 font-bold text-gray-700">ប្រភេទ</th>
                <th className="p-4 font-bold text-gray-700">លេខសម្គាល់</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap p-4 text-xs text-gray-500">
                    {new Date(log.created_at).toLocaleString('km-KH')}
                  </td>
                  <td className="p-4 font-medium text-gray-800">{log.action}</td>
                  <td className="p-4 text-gray-600">{log.entity_type}</td>
                  <td className="p-4 font-mono text-xs text-gray-400">{log.entity_id ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPage>
  )
}
