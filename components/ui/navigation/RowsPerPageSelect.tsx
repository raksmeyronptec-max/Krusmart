"use client"

import { useId } from "react"
import { ChevronDown } from "lucide-react"

export interface RowsPerPageSelectProps {
  value: number
  options: number[]
  onChange: (size: number) => void
  /** Visible label; defaults to the Khmer "rows per page". */
  label?: string
  id?: string
}

/**
 * Compact page-size control used by `Pagination`.
 *
 * Purely presentational — the parent decides whether changing it writes to the
 * URL or to client state. Kept as a native `<select>`: the option set is tiny,
 * and this way the control is keyboard- and screen-reader-correct for free.
 */
export default function RowsPerPageSelect({
  value,
  options,
  onChange,
  label = "ជួរក្នុងមួយទំព័រ",
  id,
}: RowsPerPageSelectProps) {
  const generatedId = useId()
  const selectId = id ?? `rows-per-page-${generatedId}`

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={selectId}
        className="whitespace-nowrap text-[13.5px] text-text-muted"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-9 appearance-none rounded-lg border border-divider bg-bg-surface pl-3 pr-8 text-[13.5px] tabular-nums text-text-heading outline-none transition hover:border-brand/60 focus:border-brand focus:ring-2 focus:ring-focus-ring/30"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
      </div>
    </div>
  )
}
