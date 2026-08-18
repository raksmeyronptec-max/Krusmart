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
import { hasPermission, type Permission } from "@/lib/rbac/permissions"
import type { RoleName } from "@/lib/types"

/**
 * The teacher app's information architecture.
 *
 * Thirty-two routes used to sit as flat siblings, reachable almost entirely
 * through a 29-tile grid on the dashboard — `TopNav` exposed five of them, so
 * finding anything else meant going home first. Grouping them into ten modules
 * gave navigation something to show; grouping *those* into four labelled
 * sections is what brings the top level back under the 7±2 scanning threshold.
 * Ten equally-weighted siblings is a list you read; four sections of two or
 * three is a structure you recognise.
 *
 * URLs are deliberately unchanged. Renaming `/student-list` to `/students`
 * would touch the dashboard, every in-page back link, the RBAC redirect targets
 * and `proxy.ts` — real breakage for no user-visible gain. This file is the
 * grouping layer; the routes underneath stay exactly where they are, and the
 * section a module sits in has no relationship to its path.
 *
 * Pure and isomorphic: the sidebar, the mobile sheet, the breadcrumb and the
 * command palette all read it, and `AppShell` filters it on the server. Keep it
 * free of server-only imports — `lib/rbac/permissions` is pure for exactly this
 * reason.
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
  /**
   * Extra search terms for the command palette.
   *
   * The labels are Khmer, but a teacher typing on a Latin keyboard — or one who
   * knows the route — should still find the page. Never rendered; matched only.
   */
  alias?: string
}

export interface NavModule {
  id: string
  label: string
  icon: LucideIcon
  /** Where the module goes when clicked directly. */
  href: string
  children?: NavLink[]
  alias?: string
  /**
   * Hidden from the rendered navigation when the signed-in roles lack it.
   *
   * A *convenience only*: it stops offering a teacher a console they cannot
   * use. Authorization is RLS in the database plus `requirePermission()` in the
   * server actions, neither of which this touches. A module with no permission
   * is shown to everyone, which is what every classroom tool wants — a
   * certificate printer is not a gated resource.
   */
  permission?: Permission
}

export interface NavSection {
  id: string
  /** Rendered above the group in the sidebar and the mobile sheet. */
  label: string
  modules: NavModule[]
}

/**
 * Four sections, ordered by when a teacher reaches for them: the things used
 * while standing in front of a class, then marking, then paperwork, then the
 * account. Two to three modules each — small enough to take in at a glance.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: "daily",
    label: "ការងារប្រចាំថ្ងៃ",
    modules: [
      {
        id: "dashboard",
        label: "ទំព័រដើម",
        icon: LayoutDashboard,
        href: "/dashboard",
        alias: "dashboard home",
      },
      {
        id: "students",
        label: "សិស្ស",
        icon: Users,
        href: "/student-list",
        alias: "students roster",
        permission: "students:view",
        children: [
          { label: "បញ្ជីឈ្មោះសិស្ស", href: "/student-list", primary: true, alias: "student list roster" },
          { label: "ព័ត៌មានសិស្ស", href: "/students", hidden: true, alias: "student detail" },
          { label: "បញ្ចូលព័ត៌មានសិស្ស", href: "/enrollment", alias: "enrollment add student" },
          { label: "សៀវភៅតាមដាន", href: "/student-tracking", alias: "student tracking" },
          { label: "បោះពុម្ពកាតសិស្ស", href: "/id-student", alias: "id card student print" },
          { label: "លេខកូដសិស្ស (ឪពុកម្តាយ)", href: "/print-student-codes", alias: "parent codes print" },
          { label: "វិភាគអាយុ និងកម្ពស់", href: "/print-student-age", alias: "age height analysis" },
          { label: "បោះពុម្ពបញ្ជីឈ្មោះ", href: "/print-list", alias: "print list roster" },
        ],
      },
      {
        id: "attendance",
        label: "វត្តមាន",
        icon: CalendarCheck,
        href: "/attendance/monthly",
        alias: "attendance",
        permission: "attendance:view",
        children: [
          { label: "បញ្ជីវត្តមានប្រចាំខែ", href: "/attendance/monthly", primary: true, alias: "monthly attendance" },
          { label: "ចុះវត្តមានតាមប្លង់តុ", href: "/attendance/layout", alias: "seating layout attendance" },
          { label: "អវត្តមានប្រចាំឆ្នាំ", href: "/attendance/yearly", alias: "yearly absence" },
        ],
      },
    ],
  },
  {
    id: "assessment",
    label: "ការវាយតម្លៃ",
    modules: [
      {
        id: "scores",
        label: "ពិន្ទុ",
        icon: BarChart3,
        href: "/score/total",
        alias: "score grade mark",
        permission: "scores:view",
        children: [
          { label: "តារាងពិន្ទុសរុប", href: "/score/total", primary: true, alias: "total score table" },
          { label: "បញ្ចូលពិន្ទុ", href: "/score/enter", alias: "enter score" },
          { label: "មុខវិជ្ជាតាមថ្នាក់", href: "/score/subjects", alias: "subjects template class" },
          { label: "តារាងពិន្ទុ (ទម្រង់ក្រសួង)", href: "/score/print", alias: "score print moeys" },
          { label: "តារាងចំណាត់ថ្នាក់", href: "/ranking", alias: "ranking" },
          { label: "វិភាគទិន្នន័យសរុប", href: "/score-analyse", alias: "score analyse" },
          { label: "វិភាគតាមមុខវិជ្ជា", href: "/score-analysis/subject", alias: "subject analysis" },
        ],
      },
      {
        id: "homework",
        label: "កិច្ចការផ្ទះ",
        icon: BookMarked,
        href: "/homework/enter",
        alias: "homework",
        permission: "scores:view",
        children: [
          { label: "បញ្ចូលពិន្ទុកិច្ចការផ្ទះ", href: "/homework/enter", primary: true, alias: "enter homework" },
          { label: "បញ្ជូនទៅអាណាព្យាបាល", href: "/homework/send", alias: "send homework parent" },
        ],
      },
      {
        id: "reports",
        label: "របាយការណ៍",
        icon: FileBarChart,
        href: "/parent-report",
        alias: "report",
        permission: "report_cards:view",
        children: [
          { label: "របាយការណ៍មាតាបិតា", href: "/parent-report", primary: true, alias: "parent report" },
          { label: "លទ្ធផលប្រចាំឆ្នាំ", href: "/yearly-report", alias: "yearly report result" },
          { label: "តារាងកិត្តិយស", href: "/honor-roll", alias: "honor roll" },
          { label: "សៀវភៅសិក្ខាគារិក", href: "/record-book", alias: "record book" },
        ],
      },
    ],
  },
  {
    id: "resources",
    label: "ថ្នាក់ និងឯកសារ",
    modules: [
      {
        id: "documents",
        label: "ឯកសារ",
        icon: FolderOpen,
        href: "/class-admin",
        alias: "documents",
        children: [
          { label: "រដ្ឋបាលថ្នាក់រៀន (១៣ សៀវភៅ)", href: "/class-admin", primary: true, alias: "class admin books" },
          { label: "ទាញយកវិញ្ញាបនបត្រ", href: "/certificate", alias: "certificate" },
          { label: "បំបែកសន្លឹក Poster", href: "/poster-splitter", alias: "poster splitter" },
        ],
      },
      {
        id: "classroom",
        label: "ថ្នាក់រៀន",
        icon: Sparkles,
        href: "/cleaning-schedule",
        alias: "classroom",
        children: [
          { label: "កាលវិភាគសម្អាតថ្នាក់", href: "/cleaning-schedule", primary: true, alias: "cleaning schedule" },
          { label: "បញ្ជីសារពើភ័ណ្ឌ", href: "/inventory", alias: "inventory" },
          { label: "សម្ភារៈតុបតែងថ្នាក់", href: "/decorations", alias: "decorations" },
        ],
      },
    ],
  },
  {
    id: "system",
    label: "ប្រព័ន្ធ",
    modules: [
      {
        id: "notifications",
        label: "ការជូនដំណឹង",
        icon: Bell,
        href: "/notifications",
        alias: "notifications announcements",
        permission: "announcements:view",
      },
      {
        id: "settings",
        label: "ការកំណត់",
        icon: Settings,
        href: "/profile",
        alias: "settings profile",
        children: [
          { label: "ព័ត៌មានគណនី", href: "/profile", primary: true, alias: "profile account" },
          { label: "ក្រុមការងារ KruSmart", href: "/team", alias: "team krusmart" },
          { label: "ការណែនាំប្រើប្រាស់", href: "/tutorial", alias: "tutorial guide help" },
        ],
      },
    ],
  },
]

/**
 * The flat module list, derived rather than maintained.
 *
 * Sections are the source; this exists so path resolution and the mobile bar
 * cannot drift from what the sidebar renders. Adding a module in one place adds
 * it everywhere.
 */
export const NAV_MODULES: NavModule[] = NAV_SECTIONS.flatMap((s) => s.modules)

/**
 * Sections the given roles may see, with empty sections dropped.
 *
 * FAILS OPEN, DELIBERATELY. `teacher` is unioned into the role set before the
 * check, for the same reason `getUserRoles` defaults a role-less account to
 * `['teacher']`: everything under `app/(main)/` is a classroom tool, and the
 * rows those tools reach are chosen by RLS from `students.teacher_id` and
 * `teacher_assignments` — not from `user_roles`. A `staff` grant confers only
 * `students:view`, so filtering strictly would blank វត្តមាន, ពិន្ទុ,
 * កិច្ចការផ្ទះ and របាយការណ៍ for an account that RLS will happily serve its own
 * legacy roster to. Removing navigation to data the database is still willing
 * to return is a lockout, and a cosmetic tidy is not worth one.
 *
 * The consequence, stated plainly: for every actor that can currently reach the
 * teacher app — `admin` (all permissions) or `teacher` (the floor applied here)
 * — this removes nothing. The gate is declarative and ready for a genuinely
 * narrower role, and it is the *only* thing `permission` on a `NavModule` does.
 * Authorization is RLS plus `requirePermission()` in the server actions; not
 * one server check was weakened to add this.
 */
export function sectionsForRoles(roles?: RoleName[] | null): NavSection[] {
  if (!roles || roles.length === 0) return NAV_SECTIONS

  const effective: RoleName[] = roles.includes('teacher') ? roles : [...roles, 'teacher']

  return NAV_SECTIONS.map((section) => ({
    ...section,
    modules: section.modules.filter(
      (m) => !m.permission || hasPermission(effective, m.permission),
    ),
  })).filter((section) => section.modules.length > 0)
}

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

function isPrimaryId(id: string): boolean {
  return (MOBILE_PRIMARY_IDS as readonly string[]).includes(id)
}

/** Modules that live behind `ផ្សេងៗ` rather than on the bar, still grouped. */
export function secondarySections(sections: NavSection[] = NAV_SECTIONS): NavSection[] {
  return sections
    .map((s) => ({ ...s, modules: s.modules.filter((m) => !isPrimaryId(m.id)) }))
    .filter((s) => s.modules.length > 0)
}

/** Bar slots, in the fixed order above, skipping any the roles cannot see. */
export function primaryModules(sections: NavSection[] = NAV_SECTIONS): NavModule[] {
  const flat = sections.flatMap((s) => s.modules)
  return MOBILE_PRIMARY_IDS.map((id) => flat.find((m) => m.id === id)).filter(
    (m): m is NavModule => Boolean(m),
  )
}

/**
 * Flat `href → module` index, built once at module load.
 *
 * `moduleForPath` runs on every render of the sidebar, the mobile bar and the
 * breadcrumb — three components that re-render on every route change. Walking
 * the nested structure each time was cheap but needless; this walks a
 * pre-sorted array and takes the first hit, longest href first, so
 * `/score/print` resolves to the scores module rather than to whichever entry
 * happens to be listed first.
 */
const PATH_INDEX: { href: string; navModule: NavModule; link?: NavLink }[] = NAV_MODULES.flatMap(
  // `navModule`, not `module`: `no-assign-module-variable` bans the shorter
  // name outright, because a top-level `module` binding collides with the
  // CommonJS global the bundler injects.
  (navModule) => [
    { href: navModule.href, navModule },
    ...(navModule.children ?? []).map((link) => ({ href: link.href, navModule, link })),
  ],
).sort((a, b) => b.href.length - a.href.length)

function matchPath(pathname: string) {
  return PATH_INDEX.find(
    (entry) => pathname === entry.href || pathname.startsWith(entry.href + "/"),
  )
}

/** The module a path belongs to. Longest match wins. */
export function moduleForPath(pathname: string): NavModule | undefined {
  return matchPath(pathname)?.navModule
}

/** The specific page label within a module, for the breadcrumb tail. */
export function linkForPath(pathname: string): NavLink | undefined {
  const hit = matchPath(pathname)
  // A module landing page has no child entry of its own; fall back to the
  // child that shares its href so the trail still names the page.
  return hit?.link ?? hit?.navModule.children?.find((c) => c.href === hit.href)
}

/** One searchable destination in the command palette. */
export interface NavSearchEntry {
  id: string
  label: string
  href: string
  icon: LucideIcon
  /** The module and section this destination sits under, for the result row. */
  moduleLabel: string
  sectionLabel: string
  /** Everything matched against, lower-cased once at build time. */
  haystack: string
}

/**
 * Every destination the palette can reach, sourced from the sections above.
 *
 * Derived rather than listed, so the palette can never offer a route that no
 * longer exists or miss one that was just added. Hidden detail routes are
 * excluded: `/students/[id]` is not somewhere you navigate to by name.
 */
export function searchEntries(sections: NavSection[] = NAV_SECTIONS): NavSearchEntry[] {
  const out: NavSearchEntry[] = []

  for (const section of sections) {
    for (const navModule of section.modules) {
      const children = (navModule.children ?? []).filter((c) => !c.hidden)

      // A module with children is represented by those children — its own href
      // is always one of them, so listing both would duplicate the row.
      if (children.length === 0) {
        out.push({
          id: navModule.id,
          label: navModule.label,
          href: navModule.href,
          icon: navModule.icon,
          moduleLabel: navModule.label,
          sectionLabel: section.label,
          haystack: [navModule.label, navModule.alias, navModule.href, section.label]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        })
        continue
      }

      for (const child of children) {
        out.push({
          id: `${navModule.id}:${child.href}`,
          label: child.label,
          href: child.href,
          icon: navModule.icon,
          moduleLabel: navModule.label,
          sectionLabel: section.label,
          haystack: [child.label, child.alias, child.href, navModule.label, navModule.alias, section.label]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        })
      }
    }
  }

  return out
}

/**
 * Filter destinations for a query.
 *
 * Every token has to match somewhere, so `ពិន្ទុ print` narrows rather than
 * widens. A label hit outranks an alias-or-path hit, which is why a teacher
 * typing `score` gets the score pages before the analysis ones that merely
 * mention them. No fuzzy matching: a wrong destination offered confidently is
 * worse than no destination.
 */
export function filterSearchEntries(
  entries: NavSearchEntry[],
  query: string,
): NavSearchEntry[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return entries

  return entries
    .filter((e) => tokens.every((t) => e.haystack.includes(t)))
    .map((e) => ({
      entry: e,
      rank: tokens.every((t) => e.label.toLowerCase().includes(t)) ? 0 : 1,
    }))
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.entry)
}
