import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  BarChart3,
  BookMarked,
  FileBarChart,
  FolderOpen,
  Sparkles,
  Bell,
  Settings,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react"

/**
 * The teacher app's information architecture.
 *
 * Thirty-two routes used to sit as flat siblings, reachable almost entirely
 * through a 29-tile grid on the dashboard — `TopNav` exposed five of them, so
 * finding anything else meant going home first. Grouping them into ten modules
 * gives navigation something to show and gives a teacher somewhere to look.
 *
 * URLs are deliberately unchanged. Renaming `/student-list` to `/students`
 * would touch the dashboard, every in-page back link, the RBAC redirect targets
 * and `proxy.ts` — real breakage for no user-visible gain. This file is the
 * grouping layer; the routes underneath stay exactly where they are.
 */

export interface NavLink {
  label: string
  href: string
  /** Marks the module's landing route — the one the group itself links to. */
  primary?: boolean
  /**
   * Resolvable but not listed.
   *
   * A detail route such as `/students/[id]` is reached from a pupil's row, not
   * from a menu — but the sidebar highlight and the breadcrumb both go through
   * `moduleForPath`, so the route still has to be declared here. `hidden` keeps
   * it out of the rendered lists while leaving path resolution intact.
   */
  hidden?: boolean
}

export interface NavModule {
  id: string
  label: string
  icon: LucideIcon
  /** Where the module goes when clicked directly. */
  href: string
  children?: NavLink[]
}

export const NAV_MODULES: NavModule[] = [
  {
    id: "dashboard",
    label: "ទំព័រដើម",
    icon: LayoutDashboard,
    href: "/dashboard",
  },
  {
    id: "students",
    label: "សិស្ស",
    icon: Users,
    href: "/student-list",
    children: [
      { label: "បញ្ជីឈ្មោះសិស្ស", href: "/student-list", primary: true },
      { label: "ព័ត៌មានសិស្ស", href: "/students", hidden: true },
      { label: "បញ្ចូលព័ត៌មានសិស្ស", href: "/enrollment" },
      { label: "សៀវភៅតាមដាន", href: "/student-tracking" },
      { label: "បោះពុម្ពកាតសិស្ស", href: "/id-student" },
      { label: "លេខកូដសិស្ស (ឪពុកម្តាយ)", href: "/print-student-codes" },
      { label: "វិភាគអាយុ និងកម្ពស់", href: "/print-student-age" },
      { label: "បោះពុម្ពបញ្ជីឈ្មោះ", href: "/print-list" },
    ],
  },
  {
    id: "attendance",
    label: "វត្តមាន",
    icon: CalendarCheck,
    href: "/attendance/monthly",
    children: [
      { label: "បញ្ជីវត្តមានប្រចាំខែ", href: "/attendance/monthly", primary: true },
      { label: "ចុះវត្តមានតាមប្លង់តុ", href: "/attendance/layout" },
    ],
  },
  {
    id: "scores",
    label: "ពិន្ទុ",
    icon: BarChart3,
    href: "/score/total",
    children: [
      { label: "តារាងពិន្ទុសរុប", href: "/score/total", primary: true },
      { label: "បញ្ចូលពិន្ទុ", href: "/score/enter" },
      { label: "តារាងពិន្ទុ (ទម្រង់ក្រសួង)", href: "/score/print" },
      { label: "តារាងចំណាត់ថ្នាក់", href: "/ranking" },
      { label: "វិភាគទិន្នន័យសរុប", href: "/score-analyse" },
      { label: "វិភាគតាមមុខវិជ្ជា", href: "/score-analysis/subject" },
    ],
  },
  {
    id: "homework",
    label: "កិច្ចការផ្ទះ",
    icon: BookMarked,
    href: "/homework/enter",
    children: [
      { label: "បញ្ចូលពិន្ទុកិច្ចការផ្ទះ", href: "/homework/enter", primary: true },
      { label: "បញ្ជូនទៅអាណាព្យាបាល", href: "/homework/send" },
    ],
  },
  {
    id: "reports",
    label: "របាយការណ៍",
    icon: FileBarChart,
    href: "/parent-report",
    children: [
      { label: "របាយការណ៍មាតាបិតា", href: "/parent-report", primary: true },
      { label: "លទ្ធផលប្រចាំឆ្នាំ", href: "/yearly-report" },
      { label: "តារាងកិត្តិយស", href: "/honor-roll" },
      { label: "សៀវភៅសិក្ខាគារិក", href: "/record-book" },
    ],
  },
  {
    id: "documents",
    label: "ឯកសារ",
    icon: FolderOpen,
    href: "/class-admin",
    children: [
      { label: "រដ្ឋបាលថ្នាក់រៀន (១៣ សៀវភៅ)", href: "/class-admin", primary: true },
      { label: "ទាញយកវិញ្ញាបនបត្រ", href: "/certificate" },
      { label: "បំបែកសន្លឹក Poster", href: "/poster-splitter" },
    ],
  },
  {
    id: "classroom",
    label: "ថ្នាក់រៀន",
    icon: Sparkles,
    href: "/cleaning-schedule",
    children: [
      { label: "កាលវិភាគសម្អាតថ្នាក់", href: "/cleaning-schedule", primary: true },
      { label: "បញ្ជីសារពើភ័ណ្ឌ", href: "/inventory" },
      { label: "សម្ភារៈតុបតែងថ្នាក់", href: "/decorations" },
    ],
  },
  {
    id: "notifications",
    label: "ការជូនដំណឹង",
    icon: Bell,
    href: "/notifications",
  },
  {
    id: "settings",
    label: "ការកំណត់",
    icon: Settings,
    href: "/profile",
    children: [
      { label: "ព័ត៌មានគណនី", href: "/profile", primary: true },
      { label: "ក្រុមការងារ KruSmart", href: "/team" },
      { label: "ការណែនាំប្រើប្រាស់", href: "/tutorial" },
    ],
  },
]

/**
 * The five slots on the mobile bar.
 *
 * A phone gets the four things a teacher opens during a school day, plus a
 * drawer for everything else. `ផ្សេងៗ` is not a dumping ground — it is the
 * deliberate boundary between "used while standing in front of a class" and
 * "used at a desk afterwards".
 */
export const MOBILE_PRIMARY_IDS = ["dashboard", "students", "attendance", "scores"] as const

export const MOBILE_MORE = {
  id: "more",
  label: "ផ្សេងៗ",
  icon: MoreHorizontal,
} as const

/** Modules that live behind `ផ្សេងៗ` rather than on the bar. */
export function secondaryModules(): NavModule[] {
  return NAV_MODULES.filter(
    (m) => !MOBILE_PRIMARY_IDS.includes(m.id as (typeof MOBILE_PRIMARY_IDS)[number]),
  )
}

export function primaryModules(): NavModule[] {
  return MOBILE_PRIMARY_IDS.map((id) => NAV_MODULES.find((m) => m.id === id)!).filter(Boolean)
}

/**
 * The module a path belongs to.
 *
 * Longest match wins, so `/score/print` resolves to the scores module rather
 * than to whichever entry happens to be listed first.
 */
export function moduleForPath(pathname: string): NavModule | undefined {
  let best: NavModule | undefined
  let bestLen = -1

  for (const m of NAV_MODULES) {
    const candidates = [m.href, ...(m.children?.map((c) => c.href) ?? [])]
    for (const href of candidates) {
      const hit = pathname === href || pathname.startsWith(href + "/")
      if (hit && href.length > bestLen) {
        best = m
        bestLen = href.length
      }
    }
  }
  return best
}

/** The specific page label within a module, for the breadcrumb tail. */
export function linkForPath(pathname: string): NavLink | undefined {
  const m = moduleForPath(pathname)
  if (!m?.children) return undefined
  return m.children.find((c) => pathname === c.href || pathname.startsWith(c.href + "/"))
}
