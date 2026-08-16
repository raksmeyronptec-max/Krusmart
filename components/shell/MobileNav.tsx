"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BottomSheet } from "@/components/ui/overlay/BottomSheet"
import {
  MOBILE_MORE,
  moduleForPath,
  primaryModules,
  secondaryModules,
} from "@/lib/navigation"

/**
 * Phone navigation: a fixed bar of four destinations plus a drawer.
 *
 * The desktop sidebar is not shrunk down here — a rail of ten modules is a poor
 * phone control, and a teacher standing in front of a class needs the two or
 * three things they actually use to be one thumb-tap away. The bar carries
 * ទំព័រដើម / សិស្ស / វត្តមាន / ពិន្ទុ; everything else lives behind ផ្សេងៗ.
 *
 * Below `lg` only, and `data-app-chrome` so it never reaches the paper.
 */
export function MobileNav() {
  const pathname = usePathname()
  const active = moduleForPath(pathname)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const primary = primaryModules()
  const secondary = secondaryModules()
  const moreIsActive = active ? secondary.some((m) => m.id === active.id) : false
  const MoreIcon = MOBILE_MORE.icon

  return (
    <>
      <nav
        data-app-chrome
        aria-label="ការរុករកចម្បង"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {primary.map((m) => {
            const on = active?.id === m.id
            const Icon = m.icon
            return (
              <li key={m.id}>
                <Link
                  href={m.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-bold transition ${
                    on ? "text-brand" : "text-text-muted"
                  }`}
                >
                  <Icon className="h-[21px] w-[21px]" aria-hidden="true" />
                  <span className="max-w-full truncate">{m.label}</span>
                </Link>
              </li>
            )
          })}

          <li>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-expanded={drawerOpen}
              className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-bold transition ${
                moreIsActive ? "text-brand" : "text-text-muted"
              }`}
            >
              <MoreIcon className="h-[21px] w-[21px]" aria-hidden="true" />
              <span>{MOBILE_MORE.label}</span>
            </button>
          </li>
        </ul>
      </nav>

      <BottomSheet
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="មុខងារផ្សេងៗ"
        description="ជ្រើសរើសមុខងារដែលអ្នកចង់ប្រើ"
      >
        <ul className="flex flex-col gap-1 pb-2">
          {secondary.map((m) => {
            const on = active?.id === m.id
            const Icon = m.icon
            return (
              <li key={m.id}>
                <Link
                  href={m.href}
                  onClick={() => setDrawerOpen(false)}
                  aria-current={on ? "page" : undefined}
                  className={`flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-sm font-bold transition ${
                    on ? "bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-300" : "text-text-body hover:bg-paper"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-paper text-brand">
                    <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
                  </span>
                  {m.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </BottomSheet>
    </>
  )
}

export default MobileNav
