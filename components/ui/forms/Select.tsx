"use client"

import { forwardRef, useId } from "react"
import { ChevronDown } from "lucide-react"
import { controlClass, fieldLabel } from "./fieldStyles"

export type SelectOption = { value: string; label: string; disabled?: boolean }

export interface SelectProps {
  name?: string
  options: string[] | SelectOption[]
  /** Controlled value — pair with `onChange`. */
  value?: string
  /** Uncontrolled initial value. */
  defaultValue?: string
  /** Receives the option value, matching SearchableSelect's signature. */
  onChange?: (value: string) => void
  disabled?: boolean
  required?: boolean
  /** Rendered as a leading empty option; omit for a select that always has a value. */
  placeholder?: string
  /** Visible label rendered above the control. */
  label?: string
  /** Accessible name when no visible `label` is supplied. */
  ariaLabel?: string
  id?: string
  className?: string
  /** Extra classes for the wrapper (e.g. width or grid placement). */
  wrapperClassName?: string
}

function normalize(options: string[] | SelectOption[]): SelectOption[] {
  return options.map((o) => (typeof o === "string" ? { value: o, label: o } : o))
}

/**
 * The design-system simple select.
 *
 * Deliberately wraps a native `<select>`: for short, static option sets the
 * platform control gives correct keyboard handling, screen-reader semantics and
 * the OS picker on mobile for free. It is styled with the same tokens as
 * `SearchableSelect`, so the two read as one component family.
 *
 * Reach for `SearchableSelect` instead when the list is long or async.
 */
const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    name,
    options,
    value,
    defaultValue,
    onChange,
    disabled = false,
    required = false,
    placeholder,
    label,
    ariaLabel,
    id,
    className = "",
    wrapperClassName = "",
  },
  ref
) {
  const generatedId = useId()
  const selectId = id ?? `select-${generatedId}`
  const normalized = normalize(options)

  return (
    <div className={`flex flex-col ${wrapperClassName}`}>
      {label && (
        <label htmlFor={selectId} className={fieldLabel}>
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <div className="relative w-full">
        <select
          ref={ref}
          id={selectId}
          name={name}
          value={value}
          defaultValue={defaultValue}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          required={required}
          aria-label={label ? undefined : ariaLabel}
          className={controlClass(disabled, `appearance-none pr-10 ${className}`)}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {normalized.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
      </div>
    </div>
  )
})

export default Select
