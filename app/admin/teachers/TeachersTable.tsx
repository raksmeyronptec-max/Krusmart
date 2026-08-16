'use client'

import { DataTable } from '@/components/ui/data/DataTable'
import { Badge } from '@/components/ui/feedback/Badge'
import { EmptyState } from '@/components/ui/feedback/EmptyState'

/**
 * Client boundary for the teachers table.
 *
 * `DataTable` takes render functions in its column config, and functions cannot
 * be serialised across the server/client boundary — passing them from a server
 * page throws "Functions cannot be passed directly to Client Components" at
 * request time. Neither `tsc` nor `next build` catches it.
 *
 * So the columns are declared here, inside the client, and the server page
 * hands over plain data. This is the same `page.tsx` + `Client.tsx` split the
 * rest of the codebase already uses.
 */

export interface TeacherRow {
  teacherId: string
  fullName: string | null
  classes: string[]
  isHomeroom: boolean
}

export function TeachersTable({ teachers }: { teachers: TeacherRow[] }) {
  return (
    <DataTable
      rows={teachers}
      rowKey={(t) => t.teacherId}
      caption="បញ្ជីគ្រូបង្រៀន"
      empty={<EmptyState title="មិនទាន់មានគ្រូបង្រៀនត្រូវបានចាត់តាំងទេ" />}
      columns={[
        {
          key: 'name',
          header: 'ឈ្មោះគ្រូ',
          primary: true,
          sortable: true,
          sortValue: (t) => t.fullName ?? '',
          cell: (t) => t.fullName || <span className="text-text-muted">(មិនទាន់មានឈ្មោះ)</span>,
        },
        {
          key: 'classes',
          header: 'ថ្នាក់ទទួលបន្ទុក',
          secondary: true,
          cell: (t) => t.classes.join(', ') || '—',
        },
        {
          key: 'homeroom',
          header: 'គ្រូបន្ទុកថ្នាក់',
          cell: (t) =>
            t.isHomeroom ? (
              <Badge variant="success" size="sm">បាទ/ចាស</Badge>
            ) : (
              <span className="text-text-muted">ទេ</span>
            ),
        },
      ]}
    />
  )
}
