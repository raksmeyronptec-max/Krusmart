"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CornerDownLeft, Search } from "lucide-react"
import { Dialog } from "@/components/ui/overlay/Dialog"
import {
  filterSearchEntries,
  searchEntries,
  type NavSearchEntry,
  type NavSection,
} from "@/lib/navigation"

/**
 * Go-anywhere search over the app's ~30 destinations.
 *
 * The middle of the top bar was empty while a teacher looking for
 * `តារាងចំណាត់ថ្នាក់` had to remember it lives under ពិន្ទុ, open that group and
 * read six siblings. Two actions at best. This makes it one: type, Enter.
 *
 * The result set is `NAV_SECTIONS`, flattened — not a separate list. A route
 * that does not exist can therefore never be offered, and a route added to the
 * sidebar is searchable the same day. Nothing is fetched and nothing is
 * remembered, so there is no stale data to fabricate a result from.
 *
 * Built on the shared `Dialog`, which already carries the focus trap, the
 * Escape handler, the backdrop press and the focus return. What is added here
 * is the combobox contract the dialog knows nothing about: `aria-activedescendant`
 * moving through a listbox while focus stays in the input.
 */
export function CommandPalette({
  open,
  onClose,
  sections,
}: {
  open: boolean
  onClose: () => void
  /** Role-filtered sections, so the palette cannot offer a hidden module. */
  sections: NavSection[]
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="ស្វែងរកមុខងារ"
      description="វាយឈ្មោះមុខងារ រួចចុច Enter ដើម្បីបើក"
      hideTitle
      size="lg"
      className="sm:max-w-xl"
    >
      {/*
        The body is a separate component on purpose. `Dialog` renders nothing
        while closed, so the query and the highlighted row unmount with it and
        the palette is guaranteed to open empty — no effect resetting state
        after the fact, and no chance of reopening onto a stale search.
      */}
      <PaletteBody sections={sections} onClose={onClose} />
    </Dialog>
  )
}

function PaletteBody({
  sections,
  onClose,
}: {
  sections: NavSection[]
  onClose: () => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listboxId = useId()

  const entries = useMemo(() => searchEntries(sections), [sections])
  const results = useMemo(() => filterSearchEntries(entries, query), [entries, query])

  // `Dialog` focuses the first focusable element, which is its close button.
  // The input is what the teacher came for.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  const go = useCallback(
    (entry: NavSearchEntry | undefined) => {
      if (!entry) return
      onClose()
      router.push(entry.href)
    },
    [onClose, router],
  )

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0))
        break
      case "ArrowUp":
        event.preventDefault()
        setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
        break
      case "Home":
        event.preventDefault()
        setActiveIndex(0)
        break
      case "End":
        event.preventDefault()
        setActiveIndex(Math.max(0, results.length - 1))
        break
      case "Enter":
        event.preventDefault()
        go(results[activeIndex])
        break
      // Escape is handled by `Dialog`.
    }
  }

  return (
    <>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-body"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            // A fresh query always starts at the top; the previous highlight
            // would otherwise point at whatever now sits in that row.
            setActiveIndex(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="ស្វែងរកមុខងារ..."
          aria-label="ស្វែងរកមុខងារ"
          aria-expanded
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            results.length ? `${listboxId}-opt-${activeIndex}` : undefined
          }
          className="h-11 w-full rounded-lg border border-divider bg-bg-surface pr-3 pl-9 text-sm text-text-heading outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/30"
        />
      </div>

      {/* Announced politely rather than assertively: a count changing on every
          keystroke must not interrupt whatever the reader is on. */}
      <p aria-live="polite" className="sr-only">
        {results.length > 0 ? `រកឃើញ ${results.length} មុខងារ` : "រកមិនឃើញមុខងារ"}
      </p>

      {results.length > 0 ? (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="លទ្ធផលស្វែងរក"
          className="mt-3 max-h-[min(24rem,55dvh)] overflow-y-auto overscroll-contain"
        >
          {results.map((entry, index) => {
            const Icon = entry.icon
            const isActive = index === activeIndex
            return (
              <li
                key={entry.id}
                id={`${listboxId}-opt-${index}`}
                data-index={index}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => go(entry)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  isActive ? "bg-paper" : ""
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    isActive ? "bg-brand text-brand-contrast" : "bg-paper text-brand"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="kh-truncate block text-sm font-bold text-text-heading">
                    {entry.label}
                  </span>
                  <span className="kh-truncate block text-[12px] text-text-body">
                    {entry.sectionLabel} › {entry.moduleLabel}
                  </span>
                </span>
                {isActive && (
                  <CornerDownLeft
                    className="h-4 w-4 shrink-0 text-text-body"
                    aria-hidden="true"
                  />
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-divider px-4 py-10 text-center">
          <p className="text-sm font-bold text-text-heading">រកមិនឃើញមុខងារ</p>
          <p className="mt-1 text-[13px] text-text-body">
            សូមសាកល្បងពាក្យផ្សេង ឬបើកបញ្ជីមឺនុយខាងឆ្វេង
          </p>
        </div>
      )}
    </>
  )
}

/**
 * Owns the palette's open state and the ⌘K / Ctrl+K shortcut.
 *
 * Split from the panel so the two triggers in the top bar and the keyboard
 * shortcut share exactly one piece of state, and so the shortcut keeps working
 * on a route where the trigger is off-screen.
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return
      // Never steal the shortcut from a field the teacher is typing in.
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      event.preventDefault()
      setOpen((v) => !v)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return { open, setOpen }
}

export default CommandPalette
