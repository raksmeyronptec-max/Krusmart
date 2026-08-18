"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BottomSheet } from "@/components/ui/overlay/BottomSheet"
import {
  MOBILE_MORE,
  moduleForPath,
  primaryModules,
  secondarySections,
  sectionsForRoles,
} from "@/lib/navigation"
import type { RoleName } from "@/lib/types"

/**
 * Phone navigation: a fixed bar of four destinations plus a drawer.
 *
 * The desktop sidebar is not shrunk down here — a rail of ten modules is a poor
 * phone control, and a teacher standing in front of a class needs the two or
 * three things they actually use to be one thumb-tap away. The bar carries
 * ទំព័រដើម / សិស្ស / វត្តមាន / ពិន្ទុ; everything else lives behind ផ្សេងៗ, in
 * the same four sections the sidebar uses so the two surfaces cannot teach
 * different mental models of the same app.
 *
 * The sheet's open state is React state, never history: opening and closing the
 * drawer therefore adds nothing to the back stack, and Back always leaves the
 * *page* rather than dismissing a panel the user has already forgotten about.
 * Every destination in it is a plain `<Link>`, so all of them stay deep-linkable.
 *
 * Below `lg` only, and `data-app-chrome` so it never reaches the paper.
 */
export function MobileNav({ roles }: { roles?: RoleName[] }) {
  const pathname = usePathname()
  const active = useMemo(() => moduleForPath(pathname), [pathname])
  const [drawerOpen, setDrawerOpen] = useState(false)

  const sections = useMemo(() => sectionsForRoles(roles), [roles])

  const primary = useMemo(() => primaryModules(sections), [sections])
  const secondary = useMemo(() => secondarySections(sections), [sections])

  const moreIsActive = active
    ? secondary.some((s) => s.modules.some((m) => m.id === active.id))
    : false
  const MoreIcon = MOBILE_MORE.icon

  return (
    <>
      <nav
        data-app-chrome
        aria-label="ការរុករកចម្បង"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {/* Column count follows the bar, not a literal: if a future role ever
            drops a primary destination, the remaining ones spread across the
            bar instead of leaving a blank fifth of it. */}
        <ul
          className="grid"
          style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}
        >
          {primary.map((m) => {
            const on = active?.id === m.id
            const Icon = m.icon
            return (
              <li key={m.id}>
                <Link
                  href={m.href}
                  aria-current={on ? "page" : undefined}
                  className={`relative flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-bold transition-colors ${
                    on ? "text-brand" : "text-text-body"
                  }`}
                >
                  {/* Second signal: colour alone would leave the current tab
                      indistinguishable to anyone who cannot separate the brand
                      cyan from the body grey. */}
                  {on && (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 h-[3px] w-8 rounded-b-full bg-brand"
                    />
                  )}
                  <Icon className="h-[21px] w-[21px]" aria-hidden="true" />
                  <span className="kh-truncate max-w-full">{m.label}</span>
                </Link>
              </li>
            )
          })}

          <li>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
              className={`relative flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-bold transition-colors ${
                moreIsActive ? "text-brand" : "text-text-body"
              }`}
            >
              {moreIsActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-[3px] w-8 rounded-b-full bg-brand"
                />
              )}
              <MoreIcon className="h-[21px] w-[21px]" aria-hidden="true" />
              <span>{MOBILE_MORE.label}</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* `BottomSheet` carries the focus trap, Escape, the backdrop press and
          the return of focus to this button. */}
      <BottomSheet
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="មុខងារផ្សេងៗ"
        description="ជ្រើសរើសមុខងារដែលអ្នកចង់ប្រើ"
      >
        <div className="pb-2">
          {secondary.map((section) => (
            <section key={section.id} className="pt-3 first:pt-0">
              <h3 className="kh-truncate px-1 pb-1.5 text-[11px] font-bold tracking-wide text-text-body">
                {section.label}
              </h3>
              <ul className="flex flex-col gap-1">
                {section.modules.map((m) => {
                  const on = active?.id === m.id
                  const Icon = m.icon
                  return (
                    <li key={m.id}>
                      <Link
                        href={m.href}
                        onClick={() => setDrawerOpen(false)}
                        aria-current={on ? "page" : undefined}
                        className={`flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors ${
                          on
                            ? "bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-300"
                            : "text-text-body hover:bg-paper"
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                            on ? "bg-brand text-brand-contrast" : "bg-paper text-brand"
                          }`}
                        >
                          <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
                        </span>
                        <span className="kh-truncate">{m.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </BottomSheet>
    </>
  )
}

export default MobileNav
