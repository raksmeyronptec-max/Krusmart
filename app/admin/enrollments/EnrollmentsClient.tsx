'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/actions/Button'
import { ArrowUpCircle, ArrowLeftRight, UserMinus, History, X, Loader2 } from 'lucide-react'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { promoteStudent, transferStudent, withdrawStudent } from './actions'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { EnrollmentStatus } from '@/lib/types'

export interface ClassOption {
  id: string
  name: string
  academicYearName: string
}

export interface StudentHistory {
  studentId: string
  name: string
  code: string
  gender: string
  history: {
    id: string
    className: string
    academicYearName: string
    status: EnrollmentStatus
    enrolledAt: string
    leftAt: string | null
  }[]
}

/** Khmer label + colour per enrollment status. */
const STATUS: Record<string, { label: string; tone: string }> = {
  active: { label: 'កំពុងសិក្សា', tone: 'bg-success/10 text-success border-success/30' },
  promoted: { label: 'បានឡើងថ្នាក់', tone: 'bg-brand-100 text-brand border-divider' },
  transferred: { label: 'បានផ្ទេរ', tone: 'bg-warning/10 text-warning border-warning/30' },
  withdrawn: { label: 'បានដកឈ្មោះ', tone: 'bg-danger/10 text-danger border-danger/30' },
}

type Mode = 'promote' | 'transfer' | 'withdraw'

const MODE_LABEL: Record<Mode, string> = {
  promote: 'ឡើងថ្នាក់',
  transfer: 'ផ្ទេរថ្នាក់',
  withdraw: 'ដកឈ្មោះ',
}

export default function EnrollmentsClient({
  students,
  classes,
}: {
  students: StudentHistory[]
  classes: ClassOption[]
}) {
  const [selectedId, setSelectedId] = useState(students[0]?.studentId ?? '')
  const [mode, setMode] = useState<Mode | null>(null)
  const [targetClassId, setTargetClassId] = useState('')
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [pending, startTransition] = useTransition()

  const selected = useMemo(
    () => students.find((s) => s.studentId === selectedId) ?? null,
    [students, selectedId],
  )

  const current = selected?.history.find((h) => h.status === 'active') ?? null

  const closeModal = () => {
    setMode(null)
    setTargetClassId('')
  }

  const submit = () => {
    if (!selected || !mode) return
    if (mode !== 'withdraw' && !targetClassId) return

    startTransition(async () => {
      const res =
        mode === 'promote'
          ? await promoteStudent(selected.studentId, targetClassId)
          : mode === 'transfer'
            ? await transferStudent(selected.studentId, targetClassId)
            : await withdrawStudent(selected.studentId)

      if (res.error) {
        setMessage({ text: res.error, ok: false })
      } else {
        setMessage({ text: `${MODE_LABEL[mode]}បានជោគជ័យ!`, ok: true })
        closeModal()
      }
    })
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-xl border p-4 text-sm font-bold ${
            message.ok
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-danger/30 bg-danger/10 text-danger'
          }`}
          role="status"
        >
          {message.text}
        </div>
      )}

      <div className="rounded-xl border border-divider bg-white p-6 shadow-sm">
        <SearchableSelect
          label="ជ្រើសរើសសិស្ស"
          searchPlaceholder="ស្វែងរកតាមឈ្មោះ ឬអត្តលេខ..."
          emptyMessage="រកមិនឃើញសិស្ស"
          value={selectedId}
          onChange={(v) => {
            setSelectedId(v)
            setMessage(null)
          }}
          options={students.map((s) => ({
            value: s.studentId,
            label: `${s.name} (${s.code})`,
          }))}
        />
      </div>

      {selected && (
        <>
          <div className="flex flex-wrap gap-3">
            <Button printHidden={false} onClick={() => setMode('promote')}
              disabled={!current}>
              <ArrowUpCircle className="h-4 w-4" /> ឡើងថ្នាក់
            </Button>
            <Button variant="warning" printHidden={false} onClick={() => setMode('transfer')}
              disabled={!current}>
              <ArrowLeftRight className="h-4 w-4" /> ផ្ទេរថ្នាក់
            </Button>
            <Button variant="danger" printHidden={false} onClick={() => setMode('withdraw')}
              disabled={!current}>
              <UserMinus className="h-4 w-4" /> ដកឈ្មោះ
            </Button>
            {!current && (
              <p className="self-center text-sm text-text-muted">
                សិស្សនេះមិនមានការចុះឈ្មោះសកម្មទេ
              </p>
            )}
          </div>

          <section className="overflow-hidden rounded-xl border border-divider bg-white shadow-sm">
            <header className="flex items-center gap-2 border-b border-divider bg-paper p-4">
              <History className="h-4 w-4 text-text-muted" aria-hidden="true" />
              <h2 className="font-bold text-text-heading">
                ប្រវត្តិចុះឈ្មោះ ({toKhmerNumber(selected.history.length)})
              </h2>
            </header>

            {selected.history.length === 0 ? (
              <p className="p-8 text-center text-sm text-text-muted">
                មិនទាន់មានប្រវត្តិចុះឈ្មោះទេ
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left">
                  <tr className="border-b border-divider">
                    <th className="p-4 font-bold text-text-body">ឆ្នាំសិក្សា</th>
                    <th className="p-4 font-bold text-text-body">ថ្នាក់</th>
                    <th className="p-4 font-bold text-text-body">ស្ថានភាព</th>
                    <th className="p-4 font-bold text-text-body">ចាប់ផ្តើម</th>
                    <th className="p-4 font-bold text-text-body">បញ្ចប់</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {selected.history.map((h) => {
                    const s = STATUS[h.status] ?? { label: h.status, tone: 'bg-paper text-text-body border-divider' }
                    return (
                      <tr key={h.id} className="hover:bg-paper">
                        <td className="p-4 font-medium text-text-heading">{h.academicYearName}</td>
                        <td className="p-4 font-bold text-text-heading">{h.className}</td>
                        <td className="p-4">
                          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${s.tone}`}>
                            {s.label}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-text-muted">
                          {new Date(h.enrolledAt).toLocaleDateString('km-KH')}
                        </td>
                        <td className="p-4 text-xs text-text-muted">
                          {h.leftAt ? new Date(h.leftAt).toLocaleDateString('km-KH') : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {mode && selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          {/* Full-screen on mobile, centred dialog from sm: up. */}
          <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-lg sm:rounded-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="kh-moul text-lg text-brand">{MODE_LABEL[mode]}</h3>
                <p className="mt-1 text-sm text-text-body">
                  {selected.name}
                  {current && ` · ថ្នាក់បច្ចុប្បន្ន ${current.className}`}
                </p>
              </div>
              <Button variant="ghost" size="sm" printHidden={false} onClick={closeModal} aria-label="បិទ">
                <X className="h-5 w-5" />
              </Button>
            </div>

            {mode === 'withdraw' ? (
              <p className="mb-6 rounded-xl bg-danger/10 p-4 text-sm text-danger">
                សិស្សនឹងត្រូវដកចេញពីបញ្ជីថ្នាក់ ប៉ុន្តែពិន្ទុ វត្តមាន និងប្រវត្តិទាំងអស់នៅតែរក្សាទុក។
              </p>
            ) : (
              <div className="mb-6">
                <SearchableSelect
                  label="ថ្នាក់គោលដៅ"
                  searchPlaceholder="ស្វែងរកថ្នាក់..."
                  emptyMessage="រកមិនឃើញថ្នាក់"
                  value={targetClassId}
                  onChange={setTargetClassId}
                  options={classes
                    .filter((c) => c.id !== current?.id)
                    .map((c) => ({
                      value: c.id,
                      label: `${c.academicYearName} › ${c.name}`,
                      group: c.academicYearName,
                    }))}
                />
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="ghost" size="lg" printHidden={false} onClick={closeModal}>
                បោះបង់
              </Button>
              <Button size="lg" printHidden={false} onClick={submit}
                disabled={pending || (mode !== 'withdraw' && !targetClassId)}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                បញ្ជាក់
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
