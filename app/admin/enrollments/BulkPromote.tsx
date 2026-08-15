'use client'

import { useState, useTransition } from 'react'
import { ArrowUpCircle, Loader2 } from 'lucide-react'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { bulkPromoteClass } from './actions'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { ClassOption } from './EnrollmentsClient'

/**
 * End-of-year rollover: move a whole class into the next year's class.
 *
 * Confirmation is explicit because this rewrites every enrolment in the source
 * class. It is still append-only — nothing is deleted — but it is not a click
 * anyone should make by accident.
 */
export default function BulkPromote({ classes }: { classes: ClassOption[] }) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [pending, startTransition] = useTransition()

  const from = classes.find((c) => c.id === fromId)
  const to = classes.find((c) => c.id === toId)

  const run = () => {
    startTransition(async () => {
      const res = await bulkPromoteClass(fromId, toId)
      if (res.error) {
        setMessage({ text: res.error, ok: false })
      } else {
        const skipped = res.skipped ? ` (រំលង ${toKhmerNumber(res.skipped)} នាក់)` : ''
        setMessage({
          text: `ឡើងថ្នាក់សិស្ស ${toKhmerNumber(res.promoted ?? 0)} នាក់បានជោគជ័យ!${skipped}`,
          ok: true,
        })
        setFromId(''); setToId('')
      }
      setConfirming(false)
    })
  }

  const label = (c: ClassOption) => `${c.academicYearName} › ${c.name}`

  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <ArrowUpCircle className="h-5 w-5 text-blue-600" aria-hidden="true" />
        <h2 className="font-bold text-gray-800">ឡើងថ្នាក់ជាក្រុម (ចុងឆ្នាំសិក្សា)</h2>
      </div>
      <p className="text-sm text-gray-500">
        ផ្លាស់ប្តូរសិស្សសកម្មទាំងអស់ពីថ្នាក់មួយ ទៅថ្នាក់មួយទៀត។ ប្រវត្តិចាស់នៅតែរក្សាទុក។
      </p>

      {message && (
        <div
          role="status"
          className={`rounded-xl border p-4 text-sm font-bold ${
            message.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SearchableSelect
          label="ពីថ្នាក់"
          searchPlaceholder="ស្វែងរក..."
          value={fromId}
          onChange={setFromId}
          options={classes.map((c) => ({ value: c.id, label: label(c), group: c.academicYearName }))}
        />
        <SearchableSelect
          label="ទៅថ្នាក់"
          searchPlaceholder="ស្វែងរក..."
          value={toId}
          onChange={setToId}
          options={classes
            .filter((c) => c.id !== fromId)
            .map((c) => ({ value: c.id, label: label(c), group: c.academicYearName }))}
        />
      </div>

      {!confirming ? (
        <button
          onClick={() => { setConfirming(true); setMessage(null) }}
          disabled={!fromId || !toId}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ឡើងថ្នាក់ជាក្រុម
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">
            តើអ្នកពិតជាចង់ផ្លាស់ប្តូរសិស្សទាំងអស់ពី {from && label(from)} ទៅ {to && label(to)} មែនទេ?
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirming(false)}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
            >
              បោះបង់
            </button>
            <button
              onClick={run}
              disabled={pending}
              className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              បញ្ជាក់
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
