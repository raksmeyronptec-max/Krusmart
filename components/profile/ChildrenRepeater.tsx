'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import Select from '@/components/ui/forms/Select'
import ConfirmDialog from '@/components/ui/overlay/ConfirmDialog'
import { toKhmerNumber, fromKhmerNumber } from '@/lib/utils/khmer-num'
import type { ChildInput } from '@/lib/profile/schema'

export interface ChildrenRepeaterProps {
  /** ចំនួនកូន as typed (Khmer or Latin digits). Drives the row count. */
  count: string
  rows: ChildInput[]
  onChange: (count: string, rows: ChildInput[]) => void
  inputClass: string
}

const EMPTY_CHILD: ChildInput = { name: '', gender: '', dob: '' }

/**
 * Children rows driven by ចំនួនកូន: raising the number appends empty rows,
 * lowering it trims — but never past a row the teacher has typed into
 * without an explicit confirmation.
 */
export default function ChildrenRepeater({ count, rows, onChange, inputClass }: ChildrenRepeaterProps) {
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  const parseCount = (raw: string) => {
    const canonical = fromKhmerNumber(raw).replace(/\D/g, '').slice(0, 2)
    return { canonical, n: canonical === '' ? 0 : parseInt(canonical, 10) }
  }

  /** While typing: grow freely, shrink only when nothing typed is at stake.
   * The destructive confirm waits for blur — typing "10" must not pop a
   * "delete children data?" dialog after the "1". */
  const applyCount = (raw: string) => {
    const { canonical, n } = parseCount(raw)
    if (n >= rows.length) {
      onChange(canonical, [...rows, ...Array.from({ length: n - rows.length }, () => ({ ...EMPTY_CHILD }))])
      return
    }
    const losing = rows.slice(n).some((r) => r.name || r.gender || r.dob)
    if (losing) {
      onChange(canonical, rows)
    } else {
      onChange(canonical, rows.slice(0, n))
    }
  }

  const confirmCountOnBlur = () => {
    const { n } = parseCount(count)
    if (n < rows.length && rows.slice(n).some((r) => r.name || r.gender || r.dob)) {
      setPendingCount(n)
    }
  }

  const updateRow = (index: number, patch: Partial<ChildInput>) => {
    onChange(count, rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index)
    onChange(String(next.length), next)
  }

  return (
    <div>
      <div className="max-w-[180px]">
        <label lang="km" className="mb-1 block text-[13px] font-bold leading-[1.7] text-text-body">
          ចំនួនកូន
        </label>
        <input
          type="text"
          inputMode="numeric"
          lang="km"
          value={count}
          onChange={(e) => applyCount(e.target.value)}
          onBlur={confirmCountOnBlur}
          className={inputClass}
          placeholder="ឧ. ២"
        />
      </div>

      {rows.length > 0 && (
        <ul className="mt-4 space-y-3">
          {rows.map((row, i) => (
            <li
              key={i}
              className="grid grid-cols-1 items-end gap-3 rounded-lg border border-divider bg-paper p-3 sm:grid-cols-[1fr_150px_170px_auto]"
            >
              <div>
                <label lang="km" htmlFor={`child-name-${i}`} className="mb-1 block text-[13px] font-bold leading-[1.7] text-text-body">
                  ឈ្មោះកូនទី{toKhmerNumber(i + 1)}
                </label>
                <input
                  id={`child-name-${i}`}
                  type="text"
                  lang="km"
                  value={row.name}
                  onChange={(e) => updateRow(i, { name: e.target.value })}
                  className={inputClass}
                />
              </div>
              <Select
                id={`child-gender-${i}`}
                label="ភេទ"
                options={['ប្រុស', 'ស្រី']}
                value={row.gender}
                placeholder="ជ្រើសរើសភេទ"
                onChange={(v) => updateRow(i, { gender: v })}
              />
              <div>
                <label lang="km" htmlFor={`child-dob-${i}`} className="mb-1 block text-[13px] font-bold leading-[1.7] text-text-body">
                  ថ្ងៃកំណើត
                </label>
                <input
                  id={`child-dob-${i}`}
                  type="date"
                  value={row.dob}
                  onChange={(e) => updateRow(i, { dob: e.target.value })}
                  className={inputClass}
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label={`លុបកូនទី${toKhmerNumber(i + 1)}`}
                className="tap-target inline-flex cursor-pointer items-center justify-center rounded-lg p-2.5 text-danger transition hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <Trash2 aria-hidden className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingCount !== null}
        tone="warning"
        title="បន្ថយចំនួនកូន?"
        message="ព័ត៌មានកូនដែលបានបញ្ចូលរួចហើយ នឹងត្រូវលុបចោល។ បន្តទេ?"
        confirmLabel="លុប"
        cancelLabel="ទុកដដែល"
        onConfirm={() => {
          if (pendingCount !== null) onChange(String(pendingCount), rows.slice(0, pendingCount))
          setPendingCount(null)
        }}
        onCancel={() => {
          onChange(String(rows.length), rows)
          setPendingCount(null)
        }}
      />
    </div>
  )
}
