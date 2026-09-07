'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'

import { DataTable } from '@/components/ui/data/DataTable'
import { Badge } from '@/components/ui/feedback/Badge'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { notify } from '@/components/ui/feedback/notify'
import { removeAssignment } from '../actions'

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

export interface AssignmentRow {
  assignmentId: string
  classId: string
  className: string
  subjectKey: string | null
  isHomeroom: boolean
}

export interface TeacherRow {
  teacherId: string
  fullName: string | null
  classes: string[]
  isHomeroom: boolean
  assignments: AssignmentRow[]
}

/**
 * The school's teachers, and what each of them actually holds.
 *
 * ── Why the rows are assignments, not just names ──────────────────────────
 *
 * The console could assign a teacher to a class and could never un-assign
 * them. `removeAssignment` has existed in `app/admin/actions.ts` since the
 * console was built — permission-gated, audited, revalidating — and was called
 * from nowhere. So a teacher who left the school kept their RLS access to the
 * class, kept appearing in `/score/collect`'s "whose subject is this", and the
 * only remedy was editing `teacher_assignments` by hand.
 *
 * The table also showed a comma-joined list of class *names*, which for a
 * secondary teacher holding three subjects in one class printed that class
 * three times and never said which subjects. Each assignment is its own line
 * now, labelled by subject, with the control that removes it.
 */
export function TeachersTable({
  teachers,
  subjectLabels,
}: {
  teachers: TeacherRow[]
  /**
   * `subject_key` → Khmer label, resolved once by the page from each class's
   * template. A key with no entry prints as itself rather than as a blank: an
   * unresolvable subject is a fact worth seeing, not one worth hiding.
   */
  subjectLabels: Record<string, string>
}) {
  const { confirm, dialog } = useConfirm()
  const [pending, startTransition] = useTransition()
  const [removing, setRemoving] = useState<string | null>(null)

  const onRemove = async (row: AssignmentRow, teacherName: string) => {
    const what = row.subjectKey
      ? `${subjectLabels[row.subjectKey] ?? row.subjectKey} ក្នុងថ្នាក់ ${row.className}`
      : `ថ្នាក់ ${row.className}`

    const ok = await confirm({
      title: 'លុបការចាត់តាំង',
      // Says what is lost and what is not: the marks stay, the access goes.
      message: `លុបការចាត់តាំង ${teacherName} ពី${what}? ពិន្ទុដែលបានបញ្ចូលរួចនឹងនៅដដែល ប៉ុន្តែគ្រូនេះនឹងលែងមើលឃើញថ្នាក់នេះទៀត។`,
      confirmLabel: 'លុប',
      tone: 'danger',
    })
    if (!ok) return

    setRemoving(row.assignmentId)
    startTransition(async () => {
      const res = await removeAssignment(row.assignmentId)
      setRemoving(null)
      if (res.error) notify.error(res.error)
      else notify.success('បានលុបការចាត់តាំង')
    })
  }

  return (
    <>
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
          key: 'assignments',
          header: 'ថ្នាក់ និងមុខវិជ្ជា',
          secondary: true,
          cell: (t) =>
            t.assignments.length === 0 ? (
              <span className="text-text-muted">—</span>
            ) : (
              <ul className="flex flex-col gap-1">
                {t.assignments.map((a) => (
                  <li key={a.assignmentId} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-bold text-text-heading">{a.className}</span>
                    <span className="text-text-muted">
                      {a.subjectKey
                        ? (subjectLabels[a.subjectKey] ?? a.subjectKey)
                        : 'មុខវិជ្ជាទាំងអស់'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(a, t.fullName || 'គ្រូបង្រៀន')}
                      disabled={pending && removing === a.assignmentId}
                      aria-label={`លុបការចាត់តាំង ${a.className}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition hover:bg-danger/10 hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ),
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
    {dialog}
    </>
  )
}
