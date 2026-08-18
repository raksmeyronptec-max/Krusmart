"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Home } from "lucide-react"
import { linkForPath, moduleForPath } from "@/lib/navigation"

/**
 * Where you are, derived from the path rather than passed in.
 *
 * Deriving it means a page cannot forget to declare its own trail, and cannot
 * disagree with the sidebar about which module it belongs to — both read
 * `moduleForPath`. Hidden on the dashboard, where a trail to itself is noise.
 */
export function Breadcrumb() {
  const pathname = usePathname()
  const navModule = moduleForPath(pathname)
  const leaf = linkForPath(pathname)

  if (!navModule || navModule.id === "dashboard") return null

  // Only show the leaf when it differs from the module's own landing page.
  const showLeaf = leaf && leaf.href !== navModule.href

  return (
    <nav aria-label="ទីតាំងបច្ចុប្បន្ន" className="print:hidden">
      {/* `text-text-body`, not `text-text-muted`: the muted ramp measures
          3.38:1 on the app background in light mode, which fails SC 1.4.3 for
          what is navigation text, not decoration. */}
      <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-text-body">
        <li>
          <Link
            href="/dashboard"
            className="flex items-center gap-1 rounded transition hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">ទំព័រដើម</span>
          </Link>
        </li>
        <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5 opacity-60" /></li>
        <li>
          {showLeaf ? (
            <Link href={navModule.href} className="rounded transition hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
              {navModule.label}
            </Link>
          ) : (
            <span className="font-bold text-text-heading" aria-current="page">{navModule.label}</span>
          )}
        </li>
        {showLeaf && (
          <>
            <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5 opacity-60" /></li>
            <li><span className="font-bold text-text-heading" aria-current="page">{leaf.label}</span></li>
          </>
        )}
      </ol>
    </nav>
  )
}

export default Breadcrumb
