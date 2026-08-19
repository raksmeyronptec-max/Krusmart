'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ClipboardList, CheckCircle2, CircleDashed, AlertTriangle, Loader2,
  UserPlus, Table2, Users,
} from 'lucide-react'

import { Button } from '@/components/ui/actions/Button'
import { Badge } from '@/components/ui/feedback/Badge'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { Skeleton } from '@/components/ui/feedback/Skeleton'
import { notify } from '@/components/ui/feedback/notify'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import Select from '@/components/ui/forms/Select'

import { useActiveClass } from '@/lib/hooks/useActiveClass'
import { ACADEMIC_MONTH_OPTIONS_BY_ID, MONTH_LABEL_BY_ID } from '@/lib/constants/months'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import {
  assignSubjectTeacher, getCollectionOverview, listAssignableTeachers,
  type CollectionOverview, type SubjectCompletion,
} from './actions'

/**
 * ការប្រមូលពិន្ទុ — which subjects are in, which are missing, and whose they are.
 *
 * Read-only over marks, by design and by policy: `scores` writes are owner-only
 * (migration 00007), so a homeroom teacher can see a colleague's column and
 * cannot edit it. Editing goes to whoever owns the subject; this screen's job
 * is to make it obvious *who that is* — and to flag a subject with no assignee
 * at all, which is the failure mode that otherwise produces a silently empty
 * column in every report.
 */

const STATUS: Record<SubjectCompletion['status'], {
  label: string; variant: 'success' | 'warning' | 'muted'; Icon: typeof CheckCircle2
}> = {
  complete: { label: 'បានបញ្ចូលគ្រប់', variant: 'success', Icon: CheckCircle2 },
  partial: { label: 'បញ្ចូលមិនទាន់គ្រប់', variant: 'warning', Icon: CircleDashed },
  empty: { label: 'មិនទាន់បញ្ចូល', variant: 'muted', Icon: CircleDashed },
}

export default function ScoreCollectClient() {
  const { className } = useActiveClass()

  const [scoreType, setScoreType] = useState<'monthly' | 'semester'>('monthly')
  const [month, setMonth] = useState('nov')
  const [semester, setSemester] = useState('sem1')
  const academicYear = useMemo(() => getCurrentAcademicYear(), [])

  const [overview, setOverview] = useState<CollectionOverview | null>(null)
  const [loading, setLoading] = useState(true)

  const scorePeriod = scoreType === 'monthly'
    ? `${month}-${academicYear}`
    : `${semester}-${academicYear}`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setOverview(await getCollectionOverview(scoreType, scorePeriod))
    } finally {
      setLoading(false)
    }
  }, [scoreType, scorePeriod])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously during the effect
    load()
  }, [load])

  // ------------------------------------------------------------- assignment
  const [assigning, setAssigning] = useState<SubjectCompletion | null>(null)
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([])
  const [pickedTeacher, setPickedTeacher] = useState('')
  const [saving, setSaving] = useState(false)

  const openAssign = async (subject: SubjectCompletion) => {
    setAssigning(subject)
    setPickedTeacher('')
    setTeachers(await listAssignableTeachers())
  }

  const submitAssign = async () => {
    if (!assigning || !pickedTeacher) return
    setSaving(true)
    try {
      const res = await assignSubjectTeacher(assigning.subjectKey, pickedTeacher, scoreType)
      if (res.error) {
        notify.error(res.error)
        return
      }
      notify.success('បានចាត់តាំងគ្រូ')
      setAssigning(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const periodLabel = scoreType === 'monthly'
    ? `ខែ${MONTH_LABEL_BY_ID[month] ?? month}`
    : semester === 'sem1' ? 'ឆមាសទី១' : 'ឆមាសទី២'

  const unassigned = overview?.subjects.filter((s) => s.teachers.length === 0) ?? []
  const complete = overview?.subjects.filter((s) => s.status === 'complete').length ?? 0

  return (
    <PageContainer>
      <PageHeader
        title="ការប្រមូលពិន្ទុ"
        description={
          className
            ? `ស្ថានភាពបញ្ចូលពិន្ទុតាមមុខវិជ្ជា · ថ្នាក់ ${className}`
            : 'ស្ថានភាពបញ្ចូលពិន្ទុតាមមុខវិជ្ជា'
        }
        actions={
          <Link
            href="/score/total"
            className="flex min-h-11 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-[13px] font-bold text-text-body transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Table2 className="h-4 w-4" aria-hidden="true" /> តារាងពិន្ទុសរុប
          </Link>
        }
      />

      {/* ------------------------------------------------------------ period */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="ប្រភេទពិន្ទុ" className="flex rounded-lg bg-paper p-1">
          {([
            { id: 'monthly' as const, label: 'ប្រចាំខែ' },
            { id: 'semester' as const, label: 'ឆមាស' },
          ]).map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={scoreType === id}
              onClick={() => setScoreType(id)}
              className={`flex min-h-9 items-center rounded-md px-3 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                scoreType === id ? 'bg-brand text-brand-contrast shadow-sm' : 'text-text-muted hover:text-brand'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {scoreType === 'monthly' ? (
          <Select ariaLabel="ខែ" value={month} onChange={setMonth}
            options={ACADEMIC_MONTH_OPTIONS_BY_ID} wrapperClassName="w-auto" />
        ) : (
          <Select ariaLabel="ឆមាស" value={semester} onChange={setSemester}
            options={[
              { value: 'sem1', label: 'ឆមាសទី១' },
              { value: 'sem2', label: 'ឆមាសទី២' },
            ]}
            wrapperClassName="w-auto" />
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2" role="status" aria-busy="true">
          <span className="sr-only">កំពុងទាញទិន្នន័យ...</span>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : !overview?.classId ? (
        <div className="rounded-xl border border-divider bg-bg-surface">
          <EmptyState
            title="មិនទាន់មានថ្នាក់រៀន"
            description="ការប្រមូលពិន្ទុធ្វើឡើងតាមថ្នាក់។ គណនីនេះមិនទាន់មានថ្នាក់ទេ។"
          />
        </div>
      ) : (
        <>
          {/* --------------------------------------------------------- summary */}
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-divider bg-bg-surface p-3 text-sm">
            <span className="flex items-center gap-2 font-bold text-text-heading">
              <ClipboardList className="h-4 w-4 text-brand" aria-hidden="true" />
              {periodLabel} · បានបញ្ចូលគ្រប់ {toKhmerNumber(complete)}/{toKhmerNumber(overview.subjects.length)} មុខវិជ្ជា
            </span>
            <span className="flex items-center gap-1.5 text-text-muted">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              សិស្ស {toKhmerNumber(overview.rosterSize)} នាក់
            </span>
            {!overview.isHomeroom && (
              <span className="ml-auto rounded-full bg-paper px-3 py-1 text-xs font-bold text-text-muted">
                មើលបានតែប៉ុណ្ណោះ — គ្រូមុខវិជ្ជា
              </span>
            )}
          </div>

          {unassigned.length > 0 && (
            <p className="mb-4 flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs leading-relaxed text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              មុខវិជ្ជា {toKhmerNumber(unassigned.length)} មិនទាន់មានគ្រូទទួលបន្ទុក — ពិន្ទុនឹងនៅទទេក្នុងរបាយការណ៍ រហូតដល់មានការចាត់តាំង។
            </p>
          )}

          {/* ---------------------------------------------------------- subjects */}
          <ul className="flex flex-col gap-2.5">
            {overview.subjects.map((subject) => {
              const { label, variant, Icon } = STATUS[subject.status]
              const pct = subject.total === 0 ? 0 : Math.round((subject.entered / subject.total) * 100)
              return (
                <li key={subject.subjectKey} className="rounded-xl border border-divider bg-bg-surface p-3 shadow-sm sm:p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-text-heading">{subject.label}</span>
                        <Badge variant={variant} size="sm" icon={<Icon className="h-3 w-3" aria-hidden="true" />}>
                          {label}
                        </Badge>
                        {subject.teachers.length === 0 && (
                          <Badge variant="danger" size="sm">មិនទាន់មានគ្រូ</Badge>
                        )}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
                        <span className="tabular-nums">
                          {toKhmerNumber(subject.entered)}/{toKhmerNumber(subject.total)} នាក់
                        </span>
                        {subject.teachers.length > 0 && (
                          <span>គ្រូ៖ {subject.teachers.map((t) => t.name).join(', ')}</span>
                        )}
                        {/*
                          Somebody entered marks here without an assignment —
                          worth showing, because it is how an unassigned subject
                          still ends up with data.
                        */}
                        {subject.teachers.length === 0 && subject.contributors.length > 0 && (
                          <span>បញ្ចូលដោយ៖ {subject.contributors.map((t) => t.name).join(', ')}</span>
                        )}
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-divider" aria-hidden="true">
                        <div
                          className={`h-full rounded-full transition-all ${subject.status === 'complete' ? 'bg-success' : 'bg-warning'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {overview.canAssign && (
                      <Button size="sm" variant="secondary" printHidden={false}
                        onClick={() => openAssign(subject)}>
                        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> ចាត់តាំងគ្រូ
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          <p className="mt-4 text-xs leading-relaxed text-text-muted">
            ទំព័រនេះបង្ហាញស្ថានភាពប៉ុណ្ណោះ។ ការកែពិន្ទុធ្វើដោយគ្រូម្ចាស់មុខវិជ្ជានីមួយៗ —
            គ្រូម្នាក់មិនអាចកែពិន្ទុរបស់គ្រូម្នាក់ទៀតបានទេ។
          </p>
        </>
      )}

      {/* ------------------------------------------------------ assign dialog */}
      <Dialog
        open={assigning !== null}
        onClose={() => setAssigning(null)}
        title="ចាត់តាំងគ្រូទទួលបន្ទុក"
        description={assigning ? `មុខវិជ្ជា ${assigning.label}` : undefined}
        footer={
          <>
            <Button variant="secondary" printHidden={false} onClick={() => setAssigning(null)}>បោះបង់</Button>
            <Button printHidden={false} onClick={submitAssign} loading={saving} disabled={!pickedTeacher}>
              ចាត់តាំង
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="គ្រូបង្រៀន"
            value={pickedTeacher}
            onChange={setPickedTeacher}
            placeholder="ជ្រើសរើសគ្រូ..."
            options={teachers.map((t) => ({ value: t.id, label: t.name }))}
          />
          <p className="text-xs leading-relaxed text-text-muted">
            គ្រូដែលបានចាត់តាំងនឹងឃើញតែមុខវិជ្ជានេះនៅទំព័របញ្ចូលពិន្ទុ។
            ការចាត់តាំងត្រូវបានកត់ត្រាទុក។
          </p>
          {teachers.length === 0 && (
            <p className="flex items-start gap-2 text-xs text-warning">
              <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
              កំពុងទាញបញ្ជីគ្រូ...
            </p>
          )}
        </div>
      </Dialog>
    </PageContainer>
  )
}
