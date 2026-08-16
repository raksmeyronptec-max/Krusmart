"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { NAV_MODULES, moduleForPath } from "@/lib/navigation"

/**
 * Desktop navigation rail.
 *
 * Only rendered at `lg` and above — a phone gets `MobileBottomNav`, not a
 * squeezed copy of this. Collapsing keeps the icons and drops the labels, which
 * is what makes the collapsed state useful rather than merely narrow.
 *
 * Marked `data-app-chrome`, so the print rule in `globals.css` removes it
 * entirely. Without that, every certificate would print with a 260px navy strip
 * down the left edge.
 */
export function Sidebar() {
  const pathname = usePathname()
  const active = moduleForPath(pathname)
  const [collapsed, setCollapsed] = useState(false)
  const [openId, setOpenId] = useState<string | null>(active?.id ?? null)

  return (
    <aside
      data-app-chrome
      aria-label="ការរុករកមេ"
      className={`hidden shrink-0 border-r border-divider bg-bg-surface transition-[width] duration-200 lg:flex lg:flex-col ${
        collapsed ? "w-[76px]" : "w-[260px]"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-divider px-4 py-3">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local asset; next/image adds a request for a 36px logo */}
          <img src="/logo.png" alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
          {!collapsed && <span className="kh-moul truncate text-lg text-brand">KruSmart</span>}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "ពង្រីកបញ្ជីមឺនុយ" : "បង្រួមបញ្ជីមឺនុយ"}
          aria-expanded={!collapsed}
          className="ml-auto rounded-lg p-2 text-text-muted transition hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overscroll-contain p-2">
        <ul className="flex flex-col gap-0.5">
          {NAV_MODULES.map((m) => {
            const isActive = active?.id === m.id
            const isOpen = openId === m.id && !collapsed
            const Icon = m.icon

            return (
              <li key={m.id}>
                <div className="flex items-center">
                  <Link
                    href={m.href}
                    title={collapsed ? m.label : undefined}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex min-h-11 flex-1 items-center gap-3 rounded-lg px-3 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                      isActive
                        ? "bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-300"
                        : "text-text-body hover:bg-paper"
                    } ${collapsed ? "justify-center px-0" : ""}`}
                  >
                    <Icon className="h-[19px] w-[19px] shrink-0" aria-hidden="true" />
                    {!collapsed && <span className="truncate">{m.label}</span>}
                  </Link>

                  {!collapsed && m.children && (
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : m.id)}
                      aria-label={`${m.label} — មុខងាររង`}
                      aria-expanded={isOpen}
                      className="rounded-lg p-2 text-text-muted transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>

                {isOpen && m.children && (
                  <ul className="mt-0.5 mb-1 ml-[26px] flex flex-col gap-0.5 border-l border-divider pl-3">
                    {m.children.filter((c) => !c.hidden).map((c) => {
                      const on = pathname === c.href || pathname.startsWith(c.href + "/")
                      return (
                        <li key={c.href}>
                          <Link
                            href={c.href}
                            aria-current={on ? "page" : undefined}
                            className={`flex min-h-9 items-center rounded-md px-2.5 py-1.5 text-[13px] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                              on
                                ? "font-bold text-brand"
                                : "text-text-muted hover:bg-paper hover:text-text-body"
                            }`}
                          >
                            {c.label}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}

export default Sidebar
