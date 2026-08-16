import { getAdminScope, getAuditLogs } from '../queries'
import { AdminPage, NoSchool } from '../AdminPage'
import { AuditLogTable } from './AuditLogTable'
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
      <AuditLogTable logs={logs} />
    </AdminPage>
  )
}
