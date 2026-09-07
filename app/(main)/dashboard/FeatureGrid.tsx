'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { SearchX, Search } from 'lucide-react'

import { useUserRole } from '@/lib/rbac/useUserRole'
import { useClassHref } from '@/lib/hooks/useClassHref'
import {
  filterSearchEntries,
  searchEntries,
  sectionsForRoles,
  type NavSearchEntry,
} from '@/lib/navigation'

/**
 * មុខងារទាំងអស់ — every destination in the app, grouped and searchable.
 *
 * ── This used to be a second navigation system ─────────────────────────────
 *
 * It was a hand-written array of twenty-nine tiles: its own labels, its own
 * URLs, its own six invented colour categories, and its own `adminOnly` flag —
 * all maintained separately from `lib/navigation.ts`, which the sidebar, the
 * mobile bar, the breadcrumb and the command palette already read. Two lists of
 * the same thing drift, and this pair had: the array never gained
 * `/print-center` (the product's document hub), never gained `/classroom` (the
 * class manager), never gained `/attendance/yearly`, and carried `/administration`
 * as its *only* entry point — a route declared in no module, so the breadcrumb
 * rendered blank once you arrived.
 *
 * It also shipped a second search box over that second list, beside a command
 * palette searching the first. A teacher who typed the same word into each got
 * different answers.
 *
 * So the grid is derived now. `searchEntries` and `filterSearchEntries` are the
 * palette's own functions, and `sectionsForRoles` is the sidebar's own filter —
 * adding a route to `lib/navigation.ts` adds it here, with the right label, in
 * the right group, and a route that is not declared there cannot appear.
 *
 * ── Why it still exists at all ─────────────────────────────────────────────
 *
 * Navigation is the sidebar's job and has been since the tile wall stopped
 * being the dashboard. This is the *overview*: one screen showing everything
 * the product does, which a sidebar of collapsed groups deliberately does not.
 * It stays below the day's work, never above it.
 *
 * Grouping is by module, not by colour. The old palette assigned a gradient per
 * invented category, which told a teacher what kind of thing a tile was but not
 * where to find it again; a module heading tells them both, and matches the
 * sidebar they will use next time.
 */
export function FeatureGrid() {
  const { roles } = useUserRole()
  // The tiles carry the working class like every other link in the app, so
  // jumping to តារាងចំណាត់ថ្នាក់ from ៥ខ's dashboard ranks ៥ខ.
  const classHref = useClassHref()
  const [query, setQuery] = useState('')

  // Role-filtered exactly as the sidebar is — `sectionsForRoles` fails open to
  // `teacher`, so a legacy account with no `user_roles` row still sees every
  // classroom tool. A destination gated to a principal (`/administration`)
  // simply is not in the list for anyone else.
  const entries = useMemo(() => searchEntries(sectionsForRoles(roles)), [roles])

  const visible = useMemo(() => filterSearchEntries(entries, query), [entries, query])

  /**
   * Module label → its destinations, in declaration order.
   *
   * A `Map` rather than an object: insertion order is guaranteed for every key
   * type, so the groups render in the order `NAV_SECTIONS` declares them —
   * the same order the sidebar shows — instead of whatever key ordering an
   * object literal happens to produce.
   */
  const groups = useMemo(() => {
    const out = new Map<string, NavSearchEntry[]>()
    for (const entry of visible) {
      const bucket = out.get(entry.moduleLabel)
      if (bucket) bucket.push(entry)
      else out.set(entry.moduleLabel, [entry])
    }
    return [...out]
  }, [visible])

  return (
    <section aria-labelledby="all-features" className="print:hidden">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="all-features" className="text-sm font-bold text-text-heading">
          មុខងារទាំងអស់
        </h2>
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="ស្វែងរកមុខងារ..."
            aria-label="ស្វែងរកមុខងារ"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-divider bg-bg-surface pr-3 pl-9 text-sm text-text-heading transition outline-none placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-focus-ring/30"
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm font-medium text-text-muted">
          <SearchX className="mx-auto mb-2 h-8 w-8" aria-hidden="true" />
          រកមិនឃើញមុខងារដែលអ្នកស្វែងរកទេ
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([moduleLabel, items]) => (
            <div key={moduleLabel}>
              <h3 className="mb-2 text-[12px] font-bold text-text-muted">{moduleLabel}</h3>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {items.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={classHref(entry.href)}
                      className="flex h-full min-h-11 items-center gap-2.5 rounded-xl border border-divider bg-bg-surface px-3 py-2.5 text-left shadow-sm transition hover:border-brand-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand dark:bg-brand-900/60 dark:text-brand-300">
                        <entry.icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 text-[11.5px] leading-tight font-bold text-text-heading">
                        {entry.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default FeatureGrid
