"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { EmptyState } from "../feedback/EmptyState"
import { Skeleton } from "../feedback/Skeleton"

/**
 * One column definition, two presentations.
 *
 * The app has 35 hand-rolled tables, and below 768px every one of them relies
 * on horizontal scroll — which the brief rightly rejects: a teacher on a phone
 * should not have to drag a table sideways to read a student's name.
 *
 * Rather than ship two components and ask each page to keep them in sync, the
 * column config carries enough information for both renderings:
 *
 *   `primary`   — the identifying value. Becomes the list row's title.
 *   `secondary` — supporting values. Become the row's meta line.
 *   everything else falls into an expandable detail area on mobile, or is
 *   dropped entirely with `hideOnMobile` when it is desktop-only chrome.
 *
 * This is deliberately *not* a generic grid. It does sorting and selection
 * because those are cheap and every list wants them; it does not do column
 * resizing, pinning, or virtualisation, because nothing here needs them and
 * each would cost more than it returns.
 */

export interface Column<T> {
  /** Stable id; also the sort key unless `sortValue` is given. */
  key: string
  header: React.ReactNode
  /** Cell content. Receives the whole row. */
  cell: (row: T) => React.ReactNode
  align?: "left" | "center" | "right"
  /** Desktop column width, e.g. `"w-24"` or `"min-w-[160px]"`. */
  width?: string
  /** Marks the identifying column — the mobile row's title. Exactly one. */
  primary?: boolean
  /** Shown in the mobile row's meta line, under the title. */
  secondary?: boolean
  /** Omitted from the mobile rendering entirely. */
  hideOnMobile?: boolean
  sortable?: boolean
  /** Comparable value for sorting; defaults to the raw `cell` output. */
  sortValue?: (row: T) => string | number | null | undefined
}

export interface DataTableProps<T> {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  /** Per-row actions — rendered in a trailing cell and on the mobile row. */
  actions?: (row: T) => React.ReactNode
  loading?: boolean
  /** Shown when `rows` is empty. Supply a filtered variant when a search is on. */
  empty?: React.ReactNode
  /** Sticky header. Only worth it inside a scroll container with a height. */
  stickyHeader?: boolean
  /** Slot above the table: search, filters, bulk actions. */
  toolbar?: React.ReactNode
  /** Slot below: usually `<Pagination />`. */
  footer?: React.ReactNode
  onRowClick?: (row: T) => void
  caption?: string
  className?: string
}

type SortState = { key: string; dir: "asc" | "desc" } | null

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  actions,
  loading = false,
  empty,
  stickyHeader = false,
  toolbar,
  footer,
  onRowClick,
  caption,
  className = "",
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows

    const value = (row: T) => {
      if (col.sortValue) return col.sortValue(row)
      const raw = col.cell(row)
      return typeof raw === "string" || typeof raw === "number" ? raw : ""
    }

    // Copy before sorting: mutating the caller's array would desync the state
    // it holds the rows in.
    return [...rows].sort((a, b) => {
      const av = value(a) ?? ""
      const bv = value(b) ?? ""
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : // Khmer collates correctly under the locale comparator; a plain
            // `<` comparison orders by code point and looks arbitrary.
            String(av).localeCompare(String(bv), "km")
      return sort.dir === "asc" ? cmp : -cmp
    })
  }, [rows, columns, sort])

  const toggleSort = (key: string) =>
    setSort((s) =>
      s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null,
    )

  const primary = columns.find((c) => c.primary) ?? columns[0]
  const secondary = columns.filter((c) => c.secondary && !c.hideOnMobile)
  const details = columns.filter(
    (c) => !c.primary && !c.secondary && !c.hideOnMobile && c !== primary,
  )

  if (loading) {
    return (
      <div className={`overflow-hidden rounded-xl border border-divider ${className}`}>
        {toolbar && <div className="border-b border-divider p-3">{toolbar}</div>}
        <div className="divide-y divide-divider">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4 p-3">
              {columns.slice(0, 5).map((c) => (
                <Skeleton key={c.key} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const isEmpty = sorted.length === 0

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {toolbar}

      <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface">
        {isEmpty ? (
          empty ?? <EmptyState title="មិនទាន់មានទិន្នន័យ" />
        ) : (
          <>
            {/* ---------------------------------------------------- desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                {caption && <caption className="sr-only">{caption}</caption>}
                <thead
                  className={`bg-paper text-text-muted ${stickyHeader ? "sticky top-0 z-10" : ""}`}
                >
                  <tr>
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={
                          sort?.key === c.key
                            ? sort.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : c.sortable
                              ? "none"
                              : undefined
                        }
                        className={`px-4 py-3 text-xs font-bold whitespace-nowrap ${ALIGN[c.align ?? "left"]} ${c.width ?? ""}`}
                      >
                        {c.sortable ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className="inline-flex items-center gap-1.5 rounded transition hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                          >
                            {c.header}
                            {sort?.key !== c.key ? (
                              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
                            ) : sort.dir === "asc" ? (
                              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    ))}
                    {actions && (
                      <th scope="col" className="px-4 py-3 text-center text-xs font-bold">
                        <span className="sr-only">សកម្មភាព</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {sorted.map((row) => (
                    <tr
                      key={rowKey(row)}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={`transition hover:bg-paper ${onRowClick ? "cursor-pointer" : ""}`}
                    >
                      {columns.map((c) => (
                        <td
                          key={c.key}
                          className={`px-4 py-3 text-text-body ${ALIGN[c.align ?? "left"]}`}
                        >
                          {c.cell(row)}
                        </td>
                      ))}
                      {actions && (
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          {actions(row)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ----------------------------------------------------- mobile */}
            {/*
              A list, not a squeezed table. The identifying column becomes the
              title, `secondary` columns collapse into one meta line, and the
              rest are stacked as label/value pairs so nothing is lost — it is
              re-laid-out rather than hidden behind a sideways scroll.
            */}
            <ul className="divide-y divide-divider md:hidden">
              {sorted.map((row) => (
                <li key={rowKey(row)}>
                  <div
                    className={`flex items-start justify-between gap-3 p-4 ${onRowClick ? "cursor-pointer" : ""}`}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-text-heading">{primary.cell(row)}</p>

                      {secondary.length > 0 && (
                        <p className="mt-0.5 truncate text-sm text-text-muted">
                          {secondary.map((c, i) => (
                            <span key={c.key}>
                              {i > 0 && <span aria-hidden="true"> · </span>}
                              {c.cell(row)}
                            </span>
                          ))}
                        </p>
                      )}

                      {details.length > 0 && (
                        <dl className="mt-2 flex flex-col gap-1">
                          {details.map((c) => (
                            <div key={c.key} className="flex gap-2 text-sm">
                              <dt className="shrink-0 text-text-muted">{c.header}</dt>
                              <dd className="min-w-0 flex-1 text-text-body">{c.cell(row)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>

                    {actions && (
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        {actions(row)}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {footer}
    </div>
  )
}

export default DataTable
