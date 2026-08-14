"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import RowsPerPageSelect from "./RowsPerPageSelect"

type BaseProps = {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  /**
   * When provided, renders a "rows per page" selector. In URL mode the
   * consuming page must read `pageSizeParam` (default "size") for it to take
   * effect; in controlled mode supply `onPageSizeChange`.
   */
  pageSizeOptions?: number[]
  pageSizeParam?: string
  className?: string
}

/** URL-driven mode: pages are links, filters live in the query string. */
type UrlModeProps = BaseProps & {
  searchParams: Record<string, string | undefined>
  basePath: string
  onPageChange?: never
  onPageSizeChange?: never
}

/**
 * Controlled mode: for tables that already hold their rows in client state
 * (sorting/filtering in memory). Avoids forcing a page onto the URL when the
 * surrounding data flow is not URL-driven.
 */
type ControlledModeProps = BaseProps & {
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  searchParams?: never
  basePath?: never
}

export type PaginationProps = UrlModeProps | ControlledModeProps

/** Build a href preserving existing filters, overriding the page param. */
export function pageHref(
  searchParams: Record<string, string | undefined>,
  page: number,
  basePath: string
): string {
  const p = new URLSearchParams()
  Object.entries(searchParams).forEach(([k, v]) => {
    if (v && k !== "page") p.set(k, v)
  })
  if (page > 1) p.set("page", String(page))
  const qs = p.toString()
  return `${basePath}${qs ? `?${qs}` : ""}`
}

/**
 * Build a href for a new page size. Other filters are preserved; `page` is
 * dropped so the user lands back on page 1 rather than an offset that may no
 * longer exist at the new size.
 */
export function pageSizeHref(
  searchParams: Record<string, string | undefined>,
  size: number,
  basePath: string,
  param: string
): string {
  const p = new URLSearchParams()
  Object.entries(searchParams).forEach(([k, v]) => {
    if (v && k !== "page" && k !== param) p.set(k, v)
  })
  p.set(param, String(size))
  const qs = p.toString()
  return `${basePath}${qs ? `?${qs}` : ""}`
}

/**
 * Compute the list of page numbers to render, inserting "…" gaps.
 * Always shows the first and last page plus a sibling window around the
 * current page. If a gap would hide exactly one page, that page number is
 * shown instead of an ellipsis (avoids a useless "…" standing in for one page).
 */
export function pageRange(current: number, total: number): (number | "ellipsis")[] {
  const siblings = 1
  // first + last + current + 2 siblings + 2 ellipses
  const maxSlots = siblings * 2 + 5

  if (total <= maxSlots) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const start = Math.max(current - siblings, 1)
  const end = Math.min(current + siblings, total)

  // Show an ellipsis only when it would hide 2+ pages; otherwise the number.
  const showLeftEllipsis = start > 3
  const showRightEllipsis = end < total - 2

  const pages: (number | "ellipsis")[] = [1]

  if (showLeftEllipsis) {
    pages.push("ellipsis")
  } else {
    for (let i = 2; i < start; i++) pages.push(i)
  }

  for (let i = start; i <= end; i++) {
    if (i !== 1 && i !== total) pages.push(i)
  }

  if (showRightEllipsis) {
    pages.push("ellipsis")
  } else {
    for (let i = end + 1; i < total; i++) pages.push(i)
  }

  pages.push(total)
  return pages
}

// ── Shared control styles ───────────────────────────────────────────────────
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app"

const interactive = `border border-divider bg-bg-surface text-text-body transition-all duration-150 hover:border-brand hover:bg-brand/5 hover:text-brand active:scale-[0.96] ${focusRing}`

const disabledCls =
  "border border-divider text-text-muted opacity-50 cursor-not-allowed"

const cellBase = "inline-flex h-10 w-10 items-center justify-center rounded-[10px]"
const numberCellBase =
  "inline-flex h-10 min-w-10 items-center justify-center rounded-[10px] px-3 text-[13.5px] tabular-nums"

export default function Pagination(props: PaginationProps) {
  const {
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    pageSizeOptions,
    pageSizeParam = "size",
    className = "",
  } = props

  const router = useRouter()
  const isUrlMode = props.onPageChange === undefined
  const showRowsPerPage = !!pageSizeOptions?.length

  // Nothing to page through and no size selector to show — render nothing.
  if (totalPages <= 1 && !showRowsPerPage) return null

  // Clamp to a valid range so out-of-bounds ?page= values render sanely.
  const page = Math.min(Math.max(1, currentPage), Math.max(1, totalPages))

  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalItems)

  const hasPrev = page > 1
  const hasNext = page < totalPages
  const pages = pageRange(page, totalPages)

  /** Renders a page target as a Link (URL mode) or a button (controlled mode). */
  function PageControl({
    target,
    className: cls,
    ariaLabel,
    rel,
    children,
  }: {
    target: number
    className: string
    ariaLabel: string
    rel?: string
    children: React.ReactNode
  }) {
    if (isUrlMode) {
      const { searchParams, basePath } = props as UrlModeProps
      return (
        <Link
          href={pageHref(searchParams, target, basePath)}
          rel={rel}
          aria-label={ariaLabel}
          className={cls}
        >
          {children}
        </Link>
      )
    }
    return (
      <button
        type="button"
        onClick={() => (props as ControlledModeProps).onPageChange(target)}
        aria-label={ariaLabel}
        className={cls}
      >
        {children}
      </button>
    )
  }

  return (
    <nav
      aria-label="ការបែងចែកទំព័រ"
      className={`mt-10 flex flex-col items-center justify-between gap-4 border-t border-divider pt-7 sm:flex-row ${className}`}
    >
      {/* Left cluster: rows-per-page selector + results summary */}
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
        {showRowsPerPage && (
          <RowsPerPageSelect
            value={pageSize}
            options={pageSizeOptions!}
            onChange={(size) => {
              if (isUrlMode) {
                const { searchParams, basePath } = props as UrlModeProps
                router.push(
                  pageSizeHref(searchParams, size, basePath, pageSizeParam)
                )
              } else {
                ;(props as ControlledModeProps).onPageSizeChange?.(size)
              }
            }}
            id="pagination-rows-per-page"
          />
        )}
        <p className="text-[13.5px] tabular-nums text-text-muted" aria-live="polite">
          បង្ហាញ {from}–{to} ក្នុងចំណោម {totalItems}
        </p>
      </div>

      {/* Page controls */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          {/* Prev */}
          {hasPrev ? (
            <PageControl
              target={page - 1}
              rel="prev"
              ariaLabel="ទំព័រមុន"
              className={`${cellBase} ${interactive}`}
            >
              <ChevronLeft className="h-[18px] w-[18px]" aria-hidden="true" />
            </PageControl>
          ) : (
            <span aria-disabled="true" className={`${cellBase} ${disabledCls}`}>
              <ChevronLeft className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
          )}

          {/* Compact current/total indicator — mobile only */}
          <span className="px-2 text-[13.5px] tabular-nums text-text-muted sm:hidden">
            ទំព័រ {page} / {totalPages}
          </span>

          {/* Numbered pages — sm and up */}
          <div className="hidden items-center gap-1.5 sm:flex">
            {pages.map((p, i) =>
              p === "ellipsis" ? (
                <span
                  key={`ellipsis-${i}`}
                  aria-hidden="true"
                  className={`${cellBase} text-text-muted`}
                >
                  …
                </span>
              ) : p === page ? (
                <span
                  key={p}
                  aria-current="page"
                  aria-label={`ទំព័របច្ចុប្បន្ន ${p}`}
                  className={`${numberCellBase} bg-brand font-semibold text-brand-contrast shadow-sm shadow-brand/25`}
                >
                  {p}
                </span>
              ) : (
                <PageControl
                  key={p}
                  target={p}
                  ariaLabel={`ទៅទំព័រ ${p}`}
                  className={`${numberCellBase} font-medium ${interactive}`}
                >
                  {p}
                </PageControl>
              )
            )}
          </div>

          {/* Next */}
          {hasNext ? (
            <PageControl
              target={page + 1}
              rel="next"
              ariaLabel="ទំព័របន្ទាប់"
              className={`${cellBase} ${interactive}`}
            >
              <ChevronRight className="h-[18px] w-[18px]" aria-hidden="true" />
            </PageControl>
          ) : (
            <span aria-disabled="true" className={`${cellBase} ${disabledCls}`}>
              <ChevronRight className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
          )}
        </div>
      )}
    </nav>
  )
}
