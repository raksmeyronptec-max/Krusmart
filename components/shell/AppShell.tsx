import { cookies } from "next/headers"
import { TopNav } from "@/components/TopNav"
import { Sidebar } from "./Sidebar"
import { MobileNav } from "./MobileNav"
import { Breadcrumb } from "./Breadcrumb"
import { NAV_COLLAPSED_COOKIE, NAV_GROUP_COOKIE } from "@/lib/constants/navPrefs"
import type { RoleName } from "@/lib/types"

/**
 * The teacher app's frame.
 *
 * Three navigation surfaces, each for the width it suits:
 *
 *   >= 1024px  persistent sidebar, collapsible to a 68px icon rail
 *   <  1024px  fixed bottom bar with four destinations plus a drawer
 *   all widths top bar carrying search, check-in, class context and account
 *
 * WHY THIS IS STILL A SERVER COMPONENT
 * It holds no state, so pages underneath are not pushed across the client
 * boundary by the frame that wraps them — and, more usefully, it can answer two
 * questions before the first byte of HTML that the browser would otherwise have
 * to answer after hydration:
 *
 *   which modules may this user see?  `roles` comes from the `resolveActor()`
 *       call the layout already makes, so filtering costs no extra query and
 *       the nav never flashes entries it is about to remove. The *roles* cross
 *       the boundary rather than the filtered sections, because a `NavModule`
 *       carries a `LucideIcon` — a component, which React refuses to serialise
 *       into a client prop. Each surface re-derives its own list from the same
 *       pure function, so all three still agree. Hiding is a *convenience*:
 *       RLS in the database and `requirePermission()` in the server actions
 *       remain the authorization boundary, and neither is touched here.
 *
 *   how wide is the sidebar?  from a cookie rather than `localStorage`, which
 *       cannot be read during render. A `localStorage` read would paint the
 *       rail at 264px, hydrate, and snap it to 68px on every single navigation.
 *
 * PRINTING
 * Every printable view in the app sits underneath this component, so the shell
 * has to disappear on paper completely rather than merely visually. Two
 * attributes, both honoured by rules already in `globals.css`:
 *
 *   data-app-chrome  the sidebar, bottom bar, top bar and skip link — `display: none`
 *   data-app-frame   the layout boxes — `display: contents`, which drops the
 *                    box from layout while keeping its children, so the flex
 *                    row, the padding and the scroll container stop applying
 *                    and an A4 sheet inside measures exactly what it did before
 *                    the shell existed
 */
export async function AppShell({
  children,
  roles,
}: {
  children: React.ReactNode
  /** The signed-in user's roles, already resolved by the layout. */
  roles?: RoleName[]
}) {
  const cookieStore = await cookies()
  const collapsed = cookieStore.get(NAV_COLLAPSED_COOKIE)?.value === "1"
  const openGroup = cookieStore.get(NAV_GROUP_COOKIE)?.value || null

  return (
    <div data-app-frame className="flex min-h-screen bg-bg-app">
      {/*
        First tabbable element on every page in the app. Ten sidebar entries
        plus a top bar is thirty-odd stops between the address bar and the
        content; without this, a keyboard user pays that toll on every
        navigation. Invisible until focused, then a real, readable control.
      */}
      <a
        data-app-chrome
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-brand-contrast focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-focus-ring"
      >
        រំលងទៅមាតិកាចម្បង
      </a>

      <Sidebar
        roles={roles}
        defaultCollapsed={collapsed}
        defaultOpenGroup={openGroup}
      />

      <div data-app-frame className="flex min-w-0 flex-1 flex-col">
        <TopNav roles={roles} />

        {/*
          The trail lives in the shell rather than in each page, so it appears
          everywhere immediately and cannot disagree with the sidebar about
          which module the current route belongs to — both read `moduleForPath`.
          It renders nothing on the dashboard, where a trail to itself is noise.
        */}
        <div data-app-frame className="px-4 pt-4 md:px-6 print:hidden">
          <Breadcrumb />
        </div>

        {/*
          `tabIndex={-1}` makes this a valid target for the skip link: without
          it the anchor scrolls the page but leaves focus where it was, so the
          next Tab returns to the navigation the user just skipped.

          `pb-24` clears the fixed bottom bar on phones so the last row of a
          list is not permanently hidden behind it; the padding is dropped from
          `lg` up, where the bar is not rendered.
        */}
        <main
          id="main-content"
          tabIndex={-1}
          data-app-frame
          className="flex-1 pb-24 outline-none lg:pb-0"
        >
          {children}
        </main>
      </div>

      <MobileNav roles={roles} />
    </div>
  )
}

export default AppShell
