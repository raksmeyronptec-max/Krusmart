'use client'

import { useMemo, useState, useTransition } from 'react'
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
  active: { label: 'កំពុងសិក្សា', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  promoted: { label: 'បានឡើងថ្នាក់', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  transferred: { label: 'បានផ្ទេរ', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  withdrawn: { label: 'បានដកឈ្មោះ', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
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
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
          role="status"
        >
          {message.text}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
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
            <button
              onClick={() => setMode('promote')}
              disabled={!current}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUpCircle className="h-4 w-4" /> ឡើងថ្នាក់
            </button>
            <button
              onClick={() => setMode('transfer')}
              disabled={!current}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeftRight className="h-4 w-4" /> ផ្ទេរថ្នាក់
            </button>
            <button
              onClick={() => setMode('withdraw')}
              disabled={!current}
              className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <UserMinus className="h-4 w-4" /> ដកឈ្មោះ
            </button>
            {!current && (
              <p className="self-center text-sm text-gray-500">
                សិស្សនេះមិនមានការចុះឈ្មោះសកម្មទេ
              </p>
            )}
          </div>

          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <header className="flex items-center gap-2 border-b border-gray-100 bg-slate-50 p-4">
              <History className="h-4 w-4 text-gray-500" aria-hidden="true" />
              <h2 className="font-bold text-gray-800">
                ប្រវត្តិចុះឈ្មោះ ({toKhmerNumber(selected.history.length)})
              </h2>
            </header>

            {selected.history.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-500">
                មិនទាន់មានប្រវត្តិចុះឈ្មោះទេ
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left">
                  <tr className="border-b border-gray-100">
                    <th className="p-4 font-bold text-gray-700">ឆ្នាំសិក្សា</th>
                    <th className="p-4 font-bold text-gray-700">ថ្នាក់</th>
                    <th className="p-4 font-bold text-gray-700">ស្ថានភាព</th>
                    <th className="p-4 font-bold text-gray-700">ចាប់ផ្តើម</th>
                    <th className="p-4 font-bold text-gray-700">បញ្ចប់</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selected.history.map((h) => {
                    const s = STATUS[h.status] ?? { label: h.status, tone: 'bg-gray-50 text-gray-600 border-gray-200' }
                    return (
                      <tr key={h.id} className="hover:bg-slate-50">
                        <td className="p-4 font-medium text-gray-800">{h.academicYearName}</td>
                        <td className="p-4 font-bold text-gray-800">{h.className}</td>
                        <td className="p-4">
                          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${s.tone}`}>
                            {s.label}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-gray-500">
                          {new Date(h.enrolledAt).toLocaleDateString('km-KH')}
                        </td>
                        <td className="p-4 text-xs text-gray-500">
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
          <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="kh-moul text-lg text-[#0054a6]">{MODE_LABEL[mode]}</h3>
                <p className="mt-1 text-sm text-gray-600">
                  {selected.name}
                  {current && ` · ថ្នាក់បច្ចុប្បន្ន ${current.className}`}
                </p>
              </div>
              <button onClick={closeModal} aria-label="បិទ" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {mode === 'withdraw' ? (
              <p className="mb-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
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
              <button
                onClick={closeModal}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
              >
                បោះបង់
              </button>
              <button
                onClick={submit}
                disabled={pending || (mode !== 'withdraw' && !targetClassId)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0054a6] px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                បញ្ជាក់
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
