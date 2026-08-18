'use client'

import { type ReactNode } from 'react'

/**
 * A selectable card, used by the organisation-type, education-level and grade
 * steps (§7–§9).
 *
 * Built as `<label>` + a visually-hidden `<input type="radio">` rather than a
 * clickable `<div>`. That is not a detail: a real radio in a shared `name`
 * group gives arrow-key navigation, roving focus, correct announcement of
 * "selected, 2 of 3", form submission and browser restore — all of which would
 * have to be hand-rebuilt, usually badly, on a div with an onClick.
 *
 * The selected state is drawn with a ring *and* a filled indicator dot, never
 * colour alone (§33/§6 accessibility).
 */

export interface ChoiceCardProps {
  /** Radio group name — shared by every card in the same question. */
  name: string
  value: string
  defaultChecked?: boolean
  checked?: boolean
  onChange?: (value: string) => void
  disabled?: boolean
  icon?: ReactNode
  title: string
  description?: string
  /** Short trailing detail, e.g. a grade range. */
  meta?: string
}

export function ChoiceCard({
  name,
  value,
  defaultChecked,
  checked,
  onChange,
  disabled,
  icon,
  title,
  description,
  meta,
}: ChoiceCardProps) {
  return (
    <label
      className={[
        'group relative flex cursor-pointer items-start gap-3 rounded-xl border bg-bg-surface p-4 transition-colors',
        'border-divider hover:border-brand-400',
        'has-[:checked]:border-brand has-[:checked]:bg-brand-100 has-[:checked]:ring-2 has-[:checked]:ring-brand',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring',
        'dark:has-[:checked]:bg-brand-900/50',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className="sr-only"
      />

      {icon && (
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand group-has-[:checked]:bg-brand group-has-[:checked]:text-brand-contrast dark:bg-brand-900/60 dark:text-brand-300"
        >
          {icon}
        </span>
      )}

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-bold text-text-heading">{title}</span>
        {description && <span className="text-xs leading-relaxed text-text-muted">{description}</span>}
        {meta && <span className="mt-0.5 text-xs font-medium text-brand">{meta}</span>}
      </span>

      {/* Second, non-chromatic signal for the selected state. */}
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-divider group-has-[:checked]:border-brand"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-transparent group-has-[:checked]:bg-brand" />
      </span>
    </label>
  )
}

export default ChoiceCard
