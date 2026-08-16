'use client'

import { DataTable } from '@/components/ui/data/DataTable'
import { EmptyState } from '@/components/ui/feedback/EmptyState'

/** Client boundary for the audit table — see the note in `TeachersTable`. */

export interface AuditRow {
  id: string
  created_at: string
  action: string
  entity_type: string
  entity_id?: string | null
}

export function AuditLogTable({ logs }: { logs: AuditRow[] }) {
  return (
    <DataTable
      rows={logs}
      rowKey={(log) => log.id}
      caption="កំណត់ហេតុសកម្មភាព"
      stickyHeader
      empty={<EmptyState title="មិនទាន់មានកំណត់ហេតុទេ" />}
      columns={[
        {
          key: 'action',
          header: 'សកម្មភាព',
          primary: true,
          sortable: true,
          sortValue: (log) => log.action,
          cell: (log) => <span className="font-medium text-text-heading">{log.action}</span>,
        },
        {
          key: 'created_at',
          header: 'ពេលវេលា',
          secondary: true,
          sortable: true,
          sortValue: (log) => log.created_at,
          cell: (log) => (
            <span className="whitespace-nowrap text-xs text-text-muted">
              {new Date(log.created_at).toLocaleString('km-KH')}
            </span>
          ),
        },
        { key: 'entity_type', header: 'ប្រភេទ', secondary: true, cell: (log) => log.entity_type },
        {
          key: 'entity_id',
          header: 'លេខសម្គាល់',
          cell: (log) => <span className="font-mono text-xs text-text-muted">{log.entity_id ?? '—'}</span>,
        },
      ]}
    />
  )
}
