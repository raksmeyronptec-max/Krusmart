"use client"

import { useCallback, useId, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChevronDown,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  School,
} from "lucide-react"
import { moduleForPath, sectionsForRoles, type NavModule, type NavSection } from "@/lib/navigation"
import { NAV_COLLAPSED_COOKIE, NAV_GROUP_COOKIE, writeNavPref } from "@/lib/constants/navPrefs"
import { useSchoolContext } from "@/lib/context/SchoolContext"
import { useActiveClass } from "@/lib/hooks/useActiveClass"
import { Badge } from "@/components/ui/feedback/Badge"
import type { RoleName } from "@/lib/types"
import { RailFlyout } from "./RailFlyout"
import { useMenu } from "./useMenu"

/**
 * Desktop navigation rail.
 *
 * Only rendered at `lg` and above — a phone gets `MobileNav`, not a squeezed
 * copy of this.
 *
 * WHAT THE DENSITY IS FOR
 * Ten flat, equally-weighted modules at a loose pitch overran a 768px laptop as
 * soon as one group opened. Four labelled sections at a 32px row pitch fit the
 * whole tree plus the longest open group (សិស្ស, seven children) inside 768px.
 * Measured at a true 768px viewport: 56px header band + 651px of nav + 61px
 * footer, and every one of the eight groups opens without the list scrolling.
 * The touch floor is restored on coarse pointers by `.nav-row`, so a tablet
 * still gets 44px targets without inflating what a mouse user sees.
 *
 * WHY THE COLLAPSE DOES NOT ANIMATE
 * The obvious transition — `width` over 200ms — re-lays-out the *content*
 * column sixty times a second, and that column routinely holds a score grid
 * with several hundred native `<select>` cells. Sliding the chrome is not worth
 * stuttering the page it frames, so the width snaps and only the labels fade.
 * Everything else in here animates transform/opacity or a grid track inside the
 * rail's own subtree.
 *
 * Marked `data-app-chrome`, so the print rule in `globals.css` removes it
 * entirely. Without that, every certificate would print with a navy strip down
 * the left edge.
 */
export function Sidebar({
  roles,
  defaultCollapsed,
  defaultOpenGroup,
}: {
  /**
   * Resolved server-side and handed down as plain strings, so the very first
   * client render already filters correctly and nothing flashes. The filtered
   * sections themselves cannot cross the boundary — a `NavModule` holds a
   * `LucideIcon`, and React only serialises plain objects into client props.
   */
  roles?: RoleName[]
  /** From a cookie, so the rail renders at its real width in the first byte. */
  defaultCollapsed: boolean
  defaultOpenGroup: string | null
}) {
  const pathname = usePathname()
  const active = useMemo(() => moduleForPath(pathname), [pathname])
  const sections = useMemo(() => sectionsForRoles(roles), [roles])

  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  // The route wins over the stored preference: landing on /ranking should show
  // you where you are, not re-open whatever you last had open.
  const [openId, setOpenId] = useState<string | null>(active?.id ?? defaultOpenGroup)

  /*
   * `Sidebar` is mounted by the layout and never unmounts, so seeding `openId`
   * in the initializer alone would only ever be right on a full page load:
   * clicking ពិន្ទុ would navigate to /score/total with its own group still
   * shut. This is React's documented "adjust state when a prop changes"
   * pattern — a render-time comparison rather than an effect, so the corrected
   * value paints in the same frame instead of one flash later.
   *
   * It keys on the *module*, not the path, so moving between siblings inside a
   * group (/score/total → /ranking) leaves the group exactly as the teacher
   * left it, including deliberately collapsed.
   */
  const [routedGroup, setRoutedGroup] = useState<string | undefined>(active?.id)
  if (active?.id !== routedGroup) {
    setRoutedGroup(active?.id)
    if (active?.id) setOpenId(active.id)
  }

  const schoolCtx = useSchoolContext()
  const { assignment } = useActiveClass()

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      writeNavPref(NAV_COLLAPSED_COOKIE, c ? "0" : "1")
      return !c
    })
  }, [])

  const toggleGroup = useCallback((id: string) => {
    setOpenId((current) => {
      const next = current === id ? null : id
      writeNavPref(NAV_GROUP_COOKIE, next ?? "")
      return next
    })
  }, [])

  return (
    <aside
      data-app-chrome
      aria-label="ការរុករកមេ"
      className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-divider bg-bg-surface lg:flex ${
        collapsed ? "w-[68px]" : "w-[264px]"
      }`}
    >
      {/* `h-14` matches the top bar exactly, so the two read as one band rather
          than two panels with a seam between them. */}
      <div
        className={`flex h-14 shrink-0 items-center gap-2 border-b border-divider ${
          collapsed ? "justify-center px-2" : "px-3"
        }`}
      >
        <Link
          href="/dashboard"
          aria-label="KruSmart — ទំព័រដើម"
          className="flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local asset; next/image adds a request for a 36px logo */}
          <img src="/logo.png" alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
          {!collapsed && <span className="kh-moul kh-truncate text-base text-brand">KruSmart</span>}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="បង្រួមបញ្ជីមឺនុយ"
            aria-expanded
            className="tap-target ml-auto flex items-center justify-center rounded-lg text-text-body transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        )}
      </div>

      {collapsed ? (
        <CollapsedRail
          sections={sections}
          pathname={pathname}
          activeId={active?.id}
          onExpand={toggleCollapsed}
        />
      ) : (
        <ExpandedNav
          sections={sections}
          pathname={pathname}
          activeId={active?.id}
          openId={openId}
          onToggleGroup={toggleGroup}
        />
      )}

      {/*
        The footer. The lower 40% of this rail used to be empty; it now answers
        the question a teacher managing several classes actually has — which
        school and class am I in — from context already loaded, without a single
        extra query. Pinned while the list above scrolls in its own region.
      */}
      <div className="shrink-0 border-t border-divider p-1.5">
        {collapsed ? (
          <div className="rail-item relative">
            <Link
              href="/tutorial"
              className="tap-target flex w-full items-center justify-center rounded-lg text-text-body transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
              aria-label="ការណែនាំប្រើប្រាស់"
            >
              <HelpCircle className="h-5 w-5" aria-hidden="true" />
            </Link>
            <RailTip>ការណែនាំប្រើប្រាស់</RailTip>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg px-2 py-1">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-paper text-brand">
              <School className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="kh-truncate block text-[12px] font-bold text-text-heading">
                {schoolCtx?.school?.name ?? "គ្រូបង្រៀន"}
              </span>
              <span className="kh-truncate block text-[11px] text-text-body">
                {assignment
                  ? `${assignment.academic_year_name} · ${assignment.class_name}`
                  : "ថ្នាក់ផ្ទាល់ខ្លួន"}
              </span>
            </span>
            <Link
              href="/tutorial"
              aria-label="ការណែនាំប្រើប្រាស់"
              title="ការណែនាំប្រើប្រាស់"
              /* `nav-row`, not `tap-target`: a 44px square here costs 21px of
                 the height the nav list needs to stay unscrolled, and the rail
                 only renders on a >=1024px pointer device. The coarse-pointer
                 branch of `.nav-row` restores 44px on a tablet. */
              className="nav-row flex w-8 shrink-0 items-center justify-center rounded-lg text-text-body transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <HelpCircle className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    </aside>
  )
}

/** Tooltip body for the collapsed rail. Shown on hover *and* focus-visible. */
function RailTip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="rail-tip rounded-lg border border-divider bg-bg-surface px-2.5 py-1.5 text-[12px] font-bold whitespace-nowrap text-text-heading shadow-md"
    >
      {children}
    </span>
  )
}

/**
 * How a module relates to the current route.
 *
 * Three states rather than two: the module you are *on*, the module whose child
 * you are on, and everything else. Without the middle one, opening
 * `/score/print` highlighted nothing at the top level once the group was closed.
 */
type RowState = "on" | "child" | "off"

function rowStateFor(module: NavModule, pathname: string, activeId?: string): RowState {
  if (activeId !== module.id) return "off"
  const onSelf = pathname === module.href || pathname.startsWith(module.href + "/")
  return onSelf ? "on" : "child"
}

function ExpandedNav({
  sections,
  pathname,
  activeId,
  openId,
  onToggleGroup,
}: {
  sections: NavSection[]
  pathname: string
  activeId?: string
  openId: string | null
  onToggleGroup: (id: string) => void
}) {
  return (
    <nav
      aria-label="មុខងារទាំងអស់"
      className="flex-1 overflow-y-auto overscroll-contain px-2 pt-1 pb-2"
    >
      {sections.map((section) => (
        <NavSectionGroup
          key={section.id}
          section={section}
          pathname={pathname}
          activeId={activeId}
          openId={openId}
          onToggleGroup={onToggleGroup}
        />
      ))}
    </nav>
  )
}

function NavSectionGroup({
  section,
  pathname,
  activeId,
  openId,
  onToggleGroup,
}: {
  section: NavSection
  pathname: string
  activeId?: string
  openId: string | null
  onToggleGroup: (id: string) => void
}) {
  const headingId = useId()

  return (
    <div className="pt-1.5 first:pt-1">
      {/*
        A label, not a heading. Emitting <h2>s here would put four of them ahead
        of the page's own <h1> in document order — a hierarchy that reads
        backwards to a screen reader. `aria-labelledby` on the list gives the
        group its name without inventing a heading level.
      */}
      <p
        id={headingId}
        className="kh-truncate px-2.5 pb-0.5 text-[11px] font-bold tracking-wide text-text-body"
      >
        {section.label}
      </p>
      <ul aria-labelledby={headingId} className="flex flex-col gap-0.5">
        {section.modules.map((module) => (
          <ModuleRow
            key={module.id}
            module={module}
            pathname={pathname}
            state={rowStateFor(module, pathname, activeId)}
            isOpen={openId === module.id}
            onToggleGroup={onToggleGroup}
          />
        ))}
      </ul>
    </div>
  )
}

function ModuleRow({
  module,
  pathname,
  state,
  isOpen,
  onToggleGroup,
}: {
  module: NavModule
  pathname: string
  state: RowState
  isOpen: boolean
  onToggleGroup: (id: string) => void
}) {
  const panelId = useId()
  const children = useMemo(
    () => (module.children ?? []).filter((c) => !c.hidden),
    [module.children],
  )

  /**
   * The unread count slot for ការជូនដំណឹង.
   *
   * Left deliberately empty. `/notifications` is an *outbound* feature — a
   * teacher composes messages to guardians there — so there is no inbox and no
   * unread state to count. Rendering a plausible number would be a fabrication,
   * and a permanent `0` would be noise. The slot is here, and the day an inbound
   * table exists this is the one line that changes.
   */
  const unread: number | null = null

  return (
    <li>
      <div className="relative flex items-center">
        {/*
          Signal one of three. `aria-hidden` because the state is already
          carried by `aria-current` — this bar exists for the sighted user who
          would otherwise be reading a background tint alone.
        */}
        {state !== "off" && (
          <span
            aria-hidden="true"
            className={`absolute top-1/2 left-0 -translate-y-1/2 rounded-r-full bg-brand ${
              state === "on" ? "h-4 w-[3px]" : "h-1.5 w-[3px]"
            }`}
          />
        )}

        <Link
          href={module.href}
          aria-current={state === "on" ? "page" : undefined}
          data-state={state}
          className={`nav-row flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1 pr-1 pl-3 text-[13px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring ${
            state === "on"
              ? "bg-brand-100 font-bold text-brand-800 dark:bg-brand-900/60 dark:text-brand-300"
              : state === "child"
                ? "font-bold text-text-heading hover:bg-paper"
                : "text-text-body hover:bg-paper hover:text-text-heading"
          }`}
        >
          <module.icon
            className={`h-[18px] w-[18px] shrink-0 ${state === "off" ? "" : "text-brand"}`}
            aria-hidden="true"
          />
          <span className="kh-truncate flex-1">{module.label}</span>
          {unread !== null && (
            <Badge variant="danger" size="sm" aria-label={`សារមិនទាន់អាន ${unread}`}>
              {unread}
            </Badge>
          )}
        </Link>

        {children.length > 0 && (
          <button
            type="button"
            onClick={() => onToggleGroup(module.id)}
            aria-label={`${module.label} — មុខងាររង`}
            aria-expanded={isOpen}
            aria-controls={panelId}
            className="nav-row flex w-8 shrink-0 items-center justify-center rounded-lg text-text-body transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {children.length > 0 && (
        <div
          id={panelId}
          className="nav-accordion"
          data-open={isOpen}
          // Closed children stay in the DOM so the group can animate shut, which
          // would otherwise leave eight invisible links in the tab order.
          // `inert` removes them from focus and from the accessibility tree.
          inert={!isOpen}
        >
          <div>
            <ul className="mt-0.5 mb-1 ml-[22px] flex flex-col gap-0.5 border-l border-divider pl-2">
              {children.map((child) => {
                const on = pathname === child.href || pathname.startsWith(child.href + "/")
                return (
                  <li key={child.href} className="relative">
                    {on && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1/2 -left-[9px] h-3.5 w-[3px] -translate-y-1/2 rounded-full bg-brand"
                      />
                    )}
                    <Link
                      href={child.href}
                      aria-current={on ? "page" : undefined}
                      title={child.label}
                      className={`flex min-h-[26px] items-center rounded-md px-2 py-0.5 text-[12.5px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring ${
                        on
                          ? "bg-brand-100 font-bold text-brand-800 dark:bg-brand-900/60 dark:text-brand-300"
                          : "text-text-body hover:bg-paper hover:text-text-heading"
                      }`}
                    >
                      <span className="kh-truncate">{child.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * The 68px icon rail.
 *
 * Sections survive collapse as hairline separators rather than labels — the
 * grouping still reads as grouping, and a 68px column has no room for Khmer
 * section names. Every icon carries an accessible name and a tooltip that
 * appears on keyboard focus as well as hover; a module with children opens a
 * flyout instead of navigating blind.
 */
function CollapsedRail({
  sections,
  pathname,
  activeId,
  onExpand,
}: {
  sections: NavSection[]
  pathname: string
  activeId?: string
  onExpand: () => void
}) {
  const { open, toggle, close, triggerRef, menuRef } = useMenu<HTMLDivElement>()
  // The anchor is *state*, not a ref: `RailFlyout` positions itself from it
  // during render, and a ref read at that point is not guaranteed to be the
  // value React is rendering with.
  const [flyout, setFlyout] = useState<{ navModule: NavModule; anchor: HTMLElement } | null>(
    null,
  )

  const openFlyout = (navModule: NavModule, element: HTMLButtonElement) => {
    // `useMenu` returns focus to whatever it was told the trigger is, so the
    // rail button that opened the flyout has to claim that slot.
    triggerRef.current = element
    if (open && flyout?.navModule.id === navModule.id) {
      close(true)
      return
    }
    setFlyout({ navModule, anchor: element })
    if (!open) toggle(false)
  }

  return (
    <>
      {/* Short enough to never scroll (ten icons in 768px), so the container
          stays `overflow-visible` and the tooltips are not clipped by it. */}
      <nav
        aria-label="មុខងារទាំងអស់"
        /* `overflow-visible` is what lets the tooltips escape the rail. Ten
           icons plus separators need ~630px of window; below that the rail has
           to scroll and the tooltips clip, which is the lesser harm. */
        className="flex flex-1 flex-col gap-1 overflow-visible px-2 pt-2 pb-2 [@media(max-height:640px)]:overflow-y-auto [@media(max-height:640px)]:overscroll-contain"
      >
        <div className="rail-item relative">
          <button
            type="button"
            onClick={onExpand}
            aria-label="ពង្រីកបញ្ជីមឺនុយ"
            aria-expanded={false}
            className="tap-target flex w-full items-center justify-center rounded-lg text-text-body transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
          >
            <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
          <RailTip>ពង្រីកបញ្ជីមឺនុយ</RailTip>
        </div>

        {sections.map((section, index) => (
          <ul
            key={section.id}
            aria-label={section.label}
            className={`flex flex-col gap-1 ${
              index > 0 ? "mt-1 border-t border-divider pt-2" : ""
            }`}
          >
            {section.modules.map((module) => {
              const state = rowStateFor(module, pathname, activeId)
              const children = (module.children ?? []).filter((c) => !c.hidden)
              const Icon = module.icon
              // Same three states as the expanded rail, so collapsing does not
              // lose the distinction between "you are here" and "you are inside
              // this group": a fill plus a tall accent for the former, a brand
              // icon plus a short accent for the latter.
              const face = `tap-target relative flex w-full items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring ${
                state === "on"
                  ? "bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-300"
                  : state === "child"
                    ? "text-brand hover:bg-paper"
                    : "text-text-body hover:bg-paper hover:text-text-heading"
              }`

              return (
                <li key={module.id} className="rail-item relative">
                  {state !== "off" && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-1/2 left-0 -translate-y-1/2 rounded-r-full bg-brand ${
                        state === "on" ? "h-5 w-[3px]" : "h-2 w-[3px]"
                      }`}
                    />
                  )}
                  {children.length > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => openFlyout(module, e.currentTarget)}
                      aria-haspopup="menu"
                      aria-expanded={open && flyout?.navModule.id === module.id}
                      aria-label={module.label}
                      className={face}
                    >
                      <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
                    </button>
                  ) : (
                    <Link
                      href={module.href}
                      aria-current={state === "on" ? "page" : undefined}
                      aria-label={module.label}
                      className={face}
                    >
                      <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
                    </Link>
                  )}
                  <RailTip>{module.label}</RailTip>
                </li>
              )
            })}
          </ul>
        ))}
      </nav>

      {open && flyout && (
        <RailFlyout
          navModule={flyout.navModule}
          anchor={flyout.anchor}
          activeHref={pathname}
          onNavigate={() => close()}
          panelRef={menuRef}
        />
      )}
    </>
  )
}

export default Sidebar
