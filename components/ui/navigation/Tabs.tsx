'use client'

import { useCallback, useId, useRef } from 'react'

/**
 * The tab strip, once, with the keyboard behaviour `role="tablist"` promises.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * Eleven screens had hand-rolled a tablist — `/score/{enter,total,subjects,
 * collect}`, `/profile`, `/enrollment`, `/attendance/layout`, `/homework/enter`,
 * the two login forms and `/onboarding/organisation`. Every one of them wrote
 * `role="tablist"` + `role="tab"` + `aria-selected`, and **not one** implemented
 * the keyboard interaction that markup declares.
 *
 * That is not a cosmetic gap. Announcing a tablist tells a screen-reader user
 * the set is one stop with arrow keys inside it; what they actually got was
 * every tab in the Tab order and arrow keys doing nothing. The ARIA pattern was
 * a claim the markup did not honour — the accessible version of a `?class=` the
 * page ignores.
 *
 * So the strip is one component. It carries the roving tabindex (only the
 * selected tab is tabbable), ArrowLeft/Right — plus Up/Down, because these
 * strips wrap to a column on a phone — and Home/End, and it wraps around at the
 * ends as the pattern specifies.
 *
 * ── Two variants, because two levels ───────────────────────────────────────
 *
 * `/score/subjects` is the reason this takes a `variant`. It stacks two
 * tablists — *which part of the screen* (មុខវិជ្ជា · វគ្គពិន្ទុ) above *which kind
 * of mark* (ប្រចាំខែ · ប្រចាំឆមាស) — and both were styled with the same solid
 * brand pill. Two lit pills of equal weight, side by side, read as one strip of
 * four tabs with two of them somehow active. A subordinate choice has to look
 * subordinate:
 *
 *     solid    the primary choice — a filled brand pill on a bordered track
 *     subtle   a choice *within* what solid selected — quieter, no track
 *
 * ── Labels do not wrap ─────────────────────────────────────────────────────
 *
 * `whitespace-nowrap` is load-bearing rather than tidy. Khmer has no inter-word
 * spaces, so the browser breaks these labels at syllable boundaries it infers:
 * `មុខវិជ្ជា` came apart as `មុខ / វិជ្ជា` and `ប្រចាំឆមាស` as `ប្រចាំ / ឆមាស`, which
 * is not a line break in a heading — it is a Khmer word torn in half, and it
 * made the pill two lines tall and the strip visibly ragged.
 */

export interface TabItem<Id extends string = string> {
  id: Id
  label: string
  /** Rendered before the label and hidden from assistive tech. */
  icon?: React.ComponentType<{ className?: string }>
}

export function Tabs<Id extends string>({
  items,
  value,
  onChange,
  label,
  variant = 'solid',
  idBase,
  className = '',
  fill = true,
}: {
  items: readonly TabItem<Id>[]
  value: Id
  onChange: (id: Id) => void
  /** Names the strip for assistive tech — what this set of tabs chooses. */
  label: string
  variant?: 'solid' | 'subtle'
  /**
   * Ties each tab to its panel. Pass the same base to `tabPanelProps` so
   * `aria-controls` and `aria-labelledby` point at real elements.
   */
  idBase?: string
  className?: string
  /** Full width on a phone, intrinsic from `sm` up. Off for an inline strip. */
  fill?: boolean
}) {
  const autoId = useId()
  const base = idBase ?? autoId
  const refs = useRef(new Map<Id, HTMLButtonElement | null>())

  /**
   * Arrow keys move the selection *and* the focus together. These tabs render
   * their panel immediately (no activation delay), so following focus is the
   * behaviour the pattern calls automatic activation — correct here because
   * every panel is already-loaded local state, not a fetch per arrow press.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']
      if (!keys.includes(event.key)) return

      const index = items.findIndex((item) => item.id === value)
      if (index < 0) return

      const last = items.length - 1
      let next: number
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          next = index === last ? 0 : index + 1
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          next = index === 0 ? last : index - 1
          break
        case 'Home':
          next = 0
          break
        default:
          next = last
      }

      event.preventDefault()
      const target = items[next]
      onChange(target.id)
      refs.current.get(target.id)?.focus()
    },
    [items, value, onChange],
  )

  const track =
    variant === 'solid'
      ? 'gap-1 rounded-xl border border-divider bg-bg-surface p-1'
      : 'gap-1 rounded-lg bg-paper p-0.5'

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`inline-flex ${fill ? 'w-full sm:w-auto' : ''} ${track} ${className}`}
    >
      {items.map((item) => {
        const selected = item.id === value
        const Icon = item.icon

        const shape =
          variant === 'solid'
            ? 'min-h-11 rounded-lg px-4 text-[13px]'
            : 'min-h-9 rounded-md px-3 text-xs'

        const tone = selected
          ? variant === 'solid'
            ? 'bg-brand text-brand-contrast shadow-md'
            : 'bg-bg-surface text-brand shadow-sm'
          : 'text-text-muted hover:text-brand'

        return (
          <button
            key={item.id}
            ref={(node) => { refs.current.set(item.id, node) }}
            type="button"
            role="tab"
            id={`${base}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${base}-panel-${item.id}`}
            // The roving tabindex: the strip is one stop, arrows move inside it.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 font-bold whitespace-nowrap transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${shape} ${tone}`}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The other half of the contract. A tab whose `aria-controls` points at nothing
 * is the same broken promise as a tablist with no arrow keys, so the panel has
 * to carry the matching id — spread this onto it.
 *
 * Deliberately no `tabIndex`: the pattern makes a panel focusable only when it
 * holds nothing focusable of its own, and every panel here is full of switches,
 * chips and buttons. Adding it would put an extra empty stop in front of each.
 */
export function tabPanelProps(base: string, id: string) {
  return {
    role: 'tabpanel' as const,
    id: `${base}-panel-${id}`,
    'aria-labelledby': `${base}-tab-${id}`,
  }
}
