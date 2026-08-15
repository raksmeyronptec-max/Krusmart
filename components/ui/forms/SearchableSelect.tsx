"use client"

import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Search, Loader2, Check } from "lucide-react"
import { controlClass, fieldLabel, menuListClass, menuSurface, requiredMark } from "./fieldStyles"

export type SearchableSelectOption = {
  value: string
  label: string
  disabled?: boolean
  /** Optional heading this option is filed under, mirroring `<optgroup>`. */
  group?: string
}

export interface SearchableSelectProps {
  name?: string
  options: string[] | SearchableSelectOption[]
  defaultValue?: string
  /** Controlled value — when provided, this component no longer tracks its own selection. */
  value?: string
  /** Controlled change handler — required alongside `value`. */
  onChange?: (value: string) => void
  disabled?: boolean
  required?: boolean
  placeholder?: string
  /** Accessible name for the trigger button — needed since this is a custom widget, not a native <select> a wrapping <label> would associate automatically. */
  ariaLabel?: string
  /** Visible label rendered above the control; also supplies the accessible name. */
  label?: string
  /** Shows a spinner and disables interaction while options are being fetched. */
  loading?: boolean
  searchPlaceholder?: string
  emptyMessage?: string
  /** Allows clearing back to "" via an explicit option. */
  clearable?: boolean
  clearLabel?: string
  id?: string
  className?: string
  wrapperClassName?: string
  /** Small icon rendered inside the trigger, before the value. */
  leadingIcon?: React.ReactNode
}

function normalize(
  options: string[] | SearchableSelectOption[]
): SearchableSelectOption[] {
  return options.map((o) => (typeof o === "string" ? { value: o, label: o } : o))
}

type MenuPosition = { top: number; left: number; width: number; maxHeight: number }

const MENU_GAP = 4
const MENU_MIN_HEIGHT = 180
const MENU_MAX_HEIGHT = 320

/**
 * The design-system searchable dropdown: a custom listbox with a filter field,
 * for long or asynchronously loaded option sets (locations, students, subjects…).
 *
 * The menu renders through a portal and is positioned from the trigger's
 * viewport rect, flipping above the trigger when there is more room there. That
 * is what keeps it out of `overflow-hidden`/`transform` ancestors — the reason
 * this exists rather than an absolutely-positioned menu with an escalating
 * z-index.
 */
const SearchableSelect = forwardRef<HTMLButtonElement, SearchableSelectProps>(
  function SearchableSelect(
    {
      name,
      options,
      defaultValue,
      value,
      onChange,
      disabled = false,
      required = false,
      placeholder = "ជ្រើសរើស...",
      ariaLabel,
      label,
      loading = false,
      searchPlaceholder = "ស្វែងរក...",
      emptyMessage = "រកមិនឃើញទេ",
      clearable = false,
      clearLabel = "មិនជ្រើសរើស",
      id,
      className = "",
      wrapperClassName = "",
      leadingIcon,
    },
    ref
  ) {
    const isControlled = value !== undefined
    const normalizedOptions = useMemo(() => normalize(options), [options])

    const [isOpen, setIsOpen] = useState(false)
    const [search, setSearch] = useState("")
    const [activeIndex, setActiveIndex] = useState(-1)
    const [internalSelected, setInternalSelected] = useState(defaultValue ?? "")
    const [position, setPosition] = useState<MenuPosition | null>(null)
    const [openUp, setOpenUp] = useState(false)
    const [mounted, setMounted] = useState(false)

    const triggerRef = useRef<HTMLButtonElement | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const searchRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLUListElement>(null)

    const generatedId = useId()
    const controlId = id ?? `combo-${generatedId}`
    const listboxId = `${controlId}-listbox`

    const selected = isControlled ? value! : internalSelected
    const selectedLabel =
      normalizedOptions.find((o) => o.value === selected)?.label ?? ""

    const setTriggerRef = useCallback(
      (node: HTMLButtonElement | null) => {
        triggerRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      },
      [ref]
    )

    useEffect(() => setMounted(true), [])

    const isInteractive = !disabled && !loading

    const filteredOptions = useMemo(() => {
      const q = search.trim().toLowerCase()
      if (!q) return normalizedOptions
      return normalizedOptions.filter((o) => o.label.toLowerCase().includes(q))
    }, [normalizedOptions, search])

    /**
     * Async options: adopt `defaultValue` once it becomes resolvable, but never
     * overwrite a selection the user has already made, and never clear a
     * selection just because the option list is momentarily empty.
     */
    useEffect(() => {
      if (isControlled || internalSelected || !defaultValue) return
      if (normalizedOptions.some((o) => o.value === defaultValue)) {
        setInternalSelected(defaultValue)
      }
    }, [normalizedOptions, defaultValue, internalSelected, isControlled])

    const updatePosition = useCallback(() => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP * 2
      const spaceAbove = rect.top - MENU_GAP * 2
      // Prefer opening downward; flip only when below genuinely cannot fit a
      // usable menu and above has more room.
      const shouldOpenUp = spaceBelow < MENU_MIN_HEIGHT && spaceAbove > spaceBelow

      setPosition({
        // When flipped, `top` anchors the menu's *bottom* edge; the element
        // compensates with translateY(-100%).
        top: shouldOpenUp ? rect.top - MENU_GAP : rect.bottom + MENU_GAP,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(
          MENU_MIN_HEIGHT,
          Math.min(MENU_MAX_HEIGHT, shouldOpenUp ? spaceAbove : spaceBelow)
        ),
      })
      setOpenUp(shouldOpenUp)
    }, [])

    useLayoutEffect(() => {
      if (!isOpen) return
      updatePosition()
      const onScrollOrResize = () => updatePosition()
      // `true` captures scrolls on any ancestor, not just the window.
      window.addEventListener("scroll", onScrollOrResize, true)
      window.addEventListener("resize", onScrollOrResize)
      return () => {
        window.removeEventListener("scroll", onScrollOrResize, true)
        window.removeEventListener("resize", onScrollOrResize)
      }
    }, [isOpen, updatePosition])

    // Focus the filter field once the menu exists.
    useEffect(() => {
      if (isOpen) searchRef.current?.focus()
    }, [isOpen])

    // Highlight the current selection (or the first option) when opening/filtering.
    useEffect(() => {
      if (!isOpen) return
      const selectedIdx = filteredOptions.findIndex((o) => o.value === selected)
      setActiveIndex(selectedIdx >= 0 ? selectedIdx : filteredOptions.length ? 0 : -1)
    }, [isOpen, filteredOptions, selected])

    // Keep the active option scrolled into view.
    useEffect(() => {
      if (!isOpen || activeIndex < 0) return
      listRef.current
        ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
        ?.scrollIntoView({ block: "nearest" })
    }, [activeIndex, isOpen])

    // Close on outside pointer-down (menu lives in a portal, so check both nodes).
    useEffect(() => {
      if (!isOpen) return
      function handlePointerDown(event: MouseEvent | TouchEvent) {
        const target = event.target as Node
        if (
          triggerRef.current?.contains(target) ||
          menuRef.current?.contains(target)
        ) {
          return
        }
        close()
      }
      document.addEventListener("mousedown", handlePointerDown)
      document.addEventListener("touchstart", handlePointerDown)
      return () => {
        document.removeEventListener("mousedown", handlePointerDown)
        document.removeEventListener("touchstart", handlePointerDown)
      }
    }, [isOpen])

    function close(returnFocus = false) {
      setIsOpen(false)
      setSearch("")
      setActiveIndex(-1)
      if (returnFocus) triggerRef.current?.focus()
    }

    function open() {
      if (!isInteractive) return
      setIsOpen(true)
    }

    function selectOption(v: string) {
      if (isControlled) onChange?.(v)
      else {
        setInternalSelected(v)
        onChange?.(v)
      }
      close(true)
    }

    function handleTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        open()
      }
    }

    function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault()
          setActiveIndex((i) => (filteredOptions.length ? (i + 1) % filteredOptions.length : -1))
          break
        }
        case "ArrowUp": {
          e.preventDefault()
          setActiveIndex((i) =>
            filteredOptions.length
              ? (i - 1 + filteredOptions.length) % filteredOptions.length
              : -1
          )
          break
        }
        case "Home": {
          e.preventDefault()
          setActiveIndex(filteredOptions.length ? 0 : -1)
          break
        }
        case "End": {
          e.preventDefault()
          setActiveIndex(filteredOptions.length - 1)
          break
        }
        case "Enter": {
          e.preventDefault()
          const option = filteredOptions[activeIndex]
          if (option && !option.disabled) selectOption(option.value)
          break
        }
        case "Escape": {
          e.preventDefault()
          close(true)
          break
        }
        case "Tab": {
          close()
          break
        }
      }
    }

    const menu =
      isOpen && position && mounted
        ? createPortal(
            <div
              ref={menuRef}
              style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                width: position.width,
                transform: openUp ? "translateY(-100%)" : undefined,
                zIndex: 60,
              }}
              className={menuSurface}
            >
              <div className="relative mb-2">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                  aria-hidden="true"
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  aria-controls={listboxId}
                  aria-activedescendant={
                    activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
                  }
                  className="h-10 w-full rounded-md border border-divider bg-bg-surface pl-9 pr-3 text-sm text-text-heading outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/30"
                />
              </div>

              <ul
                ref={listRef}
                id={listboxId}
                role="listbox"
                aria-label={label ?? ariaLabel}
                style={{ maxHeight: position.maxHeight }}
                className={menuListClass}
              >
                {clearable && !search && (
                  <li
                    role="option"
                    aria-selected={selected === ""}
                    onClick={() => selectOption("")}
                    className="cursor-pointer rounded-md px-3 py-2 text-sm italic text-text-muted transition hover:bg-paper"
                  >
                    {clearLabel}
                  </li>
                )}
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option, index) => {
                    const isSelected = selected === option.value
                    const isActive = index === activeIndex
                    // Group heading whenever this option starts a new group.
                    const heading =
                      option.group && option.group !== filteredOptions[index - 1]?.group
                        ? option.group
                        : null
                    return (
                      <Fragment key={option.value}>
                      {heading && (
                        <li
                          role="presentation"
                          className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-text-muted"
                        >
                          {heading}
                        </li>
                      )}
                      <li
                        id={`${listboxId}-opt-${index}`}
                        data-index={index}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={option.disabled || undefined}
                        onClick={() => !option.disabled && selectOption(option.value)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition ${
                          option.disabled
                            ? "cursor-not-allowed opacity-50"
                            : isSelected
                              ? "bg-brand/10 font-semibold text-brand"
                              : isActive
                                ? "bg-paper text-text-body"
                                : "text-text-body"
                        }`}
                      >
                        <span className="truncate">{option.label}</span>
                        {isSelected && (
                          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                        )}
                      </li>
                      </Fragment>
                    )
                  })
                ) : (
                  <li className="px-3 py-4 text-center text-sm text-text-muted">
                    {emptyMessage}
                  </li>
                )}
              </ul>
            </div>,
            document.body
          )
        : null

    return (
      <div className={`flex flex-col ${wrapperClassName}`}>
        {label && (
          <label htmlFor={controlId} className={fieldLabel}>
            {label}
            {required && <span className={requiredMark}>*</span>}
          </label>
        )}

        <div className="relative w-full">
          {/*
            Value carrier for native form submission.

            When the field is required this cannot be `type="hidden"` or
            `readOnly` — both are barred from constraint validation, so
            `required` would silently never fire. Instead it is a real text
            input that is zero-size and transparent but still rendered, which is
            what browsers need in order to focus it and report validity. The
            no-op `onChange` keeps React happy for a value the user can never
            reach (tabIndex -1, no pointer events); focusing it opens the menu so
            the validation bubble points at something actionable.
          */}
          {name &&
            (required ? (
              <input
                type="text"
                name={name}
                value={selected}
                required
                onChange={() => {}}
                tabIndex={-1}
                aria-hidden="true"
                onFocus={open}
                className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
              />
            ) : (
              <input type="hidden" name={name} value={selected} />
            ))}

          <button
            ref={setTriggerRef}
            id={controlId}
            type="button"
            disabled={!isInteractive}
            onClick={() => (isOpen ? close() : open())}
            onKeyDown={handleTriggerKeyDown}
            aria-label={label ? undefined : ariaLabel}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-controls={isOpen ? listboxId : undefined}
            className={controlClass(!isInteractive, className)}
          >
            <span className="flex min-w-0 items-center gap-2">
              {leadingIcon && (
                <span
                  className="flex shrink-0 items-center text-text-muted [&>svg]:h-4 [&>svg]:w-4"
                  aria-hidden="true"
                >
                  {leadingIcon}
                </span>
              )}
              <span
                className={`truncate ${selectedLabel ? "text-text-heading" : "text-text-muted"}`}
              >
                {loading ? "កំពុងទាញយក..." : selectedLabel || placeholder}
              </span>
            </span>
            {loading ? (
              <Loader2
                className="h-4 w-4 shrink-0 animate-spin text-text-muted"
                aria-hidden="true"
              />
            ) : (
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            )}
          </button>
        </div>

        {menu}
      </div>
    )
  }
)

export default SearchableSelect
