import { TopNav } from "@/components/TopNav"
import { Sidebar } from "./Sidebar"
import { MobileNav } from "./MobileNav"
import { Breadcrumb } from "./Breadcrumb"

/**
 * The teacher app's frame.
 *
 * Three navigation surfaces, each for the width it suits:
 *
 *   >= 1024px  persistent sidebar, collapsible to icons
 *   <  1024px  fixed bottom bar with four destinations plus a drawer
 *   all widths top bar carrying check-in, class context, theme and account
 *
 * PRINTING
 * Every printable view in the app sits underneath this component, so the shell
 * has to disappear on paper completely rather than merely visually. Two
 * attributes, both honoured by rules already in `globals.css`:
 *
 *   data-app-chrome  the sidebar, bottom bar and top bar — `display: none`
 *   data-app-frame   the layout boxes — `display: contents`, which drops the
 *                    box from layout while keeping its children, so the flex
 *                    row, the padding and the scroll container stop applying
 *                    and an A4 sheet inside measures exactly what it did before
 *                    the shell existed
 *
 * A server component: it holds no state of its own, so pages underneath are not
 * pushed across the client boundary by the frame that wraps them.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-app-frame className="flex min-h-screen bg-bg-app">
      <Sidebar />

      <div data-app-frame className="flex min-w-0 flex-1 flex-col">
        <TopNav />

        {/*
          `pb-24` clears the fixed bottom bar on phones so the last row of a
          list is not permanently hidden behind it; the padding is dropped from
          `lg` up, where the bar is not rendered.
        */}
        {/*
          The trail lives in the shell rather than in each page, so it appears
          everywhere immediately and cannot disagree with the sidebar about
          which module the current route belongs to — both read `moduleForPath`.
          It renders nothing on the dashboard, where a trail to itself is noise.
        */}
        <div data-app-frame className="px-4 pt-4 md:px-6 print:hidden">
          <Breadcrumb />
        </div>

        <main data-app-frame className="flex-1 pb-24 lg:pb-0">
          {children}
        </main>
      </div>

      <MobileNav />
    </div>
  )
}

export default AppShell
