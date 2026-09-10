/**
 * The active class travels — checked against the real source.
 *
 *     node scripts/verify-class-context.mts
 *
 * ── What this guards ───────────────────────────────────────────────────────
 *
 * The product's central rule is that a teacher picks a class once and every
 * screen inherits it. That rule has three moving parts, and each of them fails
 * *silently* — the page renders, the numbers are real, they are simply another
 * class's:
 *
 *   1. THE LIST.       `CLASS_SCOPED_ROUTES` says which routes read the class.
 *                      A route that reads `?class=` but is missing from the
 *                      list is a route navigation drops the class on the way
 *                      into; a route in the list that reads nothing is a lie in
 *                      the address bar. Both directions are checked here, by
 *                      parsing what the pages actually do.
 *
 *   2. THE DEFAULT.    With no `?class=`, the server picks a class with
 *                      `chooseAssignment` and the client picks one in
 *                      `TeacherContext`. Those were two different rules —
 *                      homeroom-then-oldest against year-then-name — so with
 *                      two homeroom classes in one year the top bar named one
 *                      class and the page's figures came from another.
 *
 *   3. THE SURFACES.   Every navigation surface must route its hrefs through
 *                      `useClassHref`. A `<Link href={module.href}>` added back
 *                      by hand is invisible in review and drops the class for
 *                      whichever destination it points at.
 *
 * Source is parsed rather than imported wherever the target is a `.tsx` or a
 * `server-only` module — node can do neither. The pure half (`withClassParam`,
 * `chooseAssignment`) is imported and actually run.
 *
 * Exits non-zero on any failure.
 */

import * as nodeModule from 'node:module'
import { existsSync } from 'node:fs'

/**
 * `lib/utils/classHref.ts` imports `./scopeParam` without an extension, which
 * the bundler resolves and node does not. Rather than change an application
 * module to suit a harness, the harness resolves the way the bundler does:
 * probe `.ts` / `.tsx` / `/index.ts`, and map the `@/` alias to the project
 * root. Same approach as `scripts/verify-navigation.mts`, one specifier form
 * wider — the point either way is to exercise the real module, since a regex
 * over the source would happily pass on a file that does not parse.
 */
type ResolveResult = { url: string; shortCircuit?: boolean }
type NextResolve = (specifier: string, context: unknown) => ResolveResult
const registerHooks = (
  nodeModule as unknown as {
    registerHooks?: (hooks: {
      resolve: (specifier: string, context: unknown, next: NextResolve) => ResolveResult
    }) => void
  }
).registerHooks

if (!registerHooks) {
  console.error('needs node 22.15+ for module.registerHooks')
  process.exit(1)
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const base =
      specifier.startsWith('@/')
        ? new URL(specifier.slice(2), new URL('../', import.meta.url))
        : specifier.startsWith('.')
          ? new URL(specifier, (context as { parentURL?: string }).parentURL ?? import.meta.url)
          : null

    if (base && !existsSync(base)) {
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        const candidate = new URL(base.href + ext)
        if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Dynamic, and after `registerHooks` above: static imports are hoisted and
// evaluated before the hook is installed, so `classHref`'s own extensionless
// `./scopeParam` would fail to resolve.
const { CLASS_SCOPED_ROUTES, isClassScopedPath, withClassParam } =
  await import('../lib/utils/classHref.ts')
const { chooseAssignment } = await import('../lib/utils/defaultClass.ts')

const root = fileURLToPath(new URL('../', import.meta.url))
const MAIN = join(root, 'app', '(main)')

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const files = walk(MAIN)

/**
 * `app/(main)/score/enter/page.tsx` → `/score/enter`.
 * Route groups and dynamic segments are dropped: `/students/[id]` is reached by
 * id and inherits its parent's scoping, so it is not a route in its own right
 * for this purpose.
 */
function routeOf(file: string): string | null {
  const rel = relative(MAIN, file).replace(/\\/g, '/')
  if (!rel.endsWith('/page.tsx') && rel !== 'page.tsx') return null
  const segments = rel.replace(/\/?page\.tsx$/, '').split('/').filter(Boolean)
  if (segments.some((s) => s.startsWith('[') || s.startsWith('('))) return null
  return '/' + segments.join('/')
}

// ---------------------------------------------------------------- 1. the list
console.log('\n1. every route that reads the class is declared as class-scoped:')

/**
 * A route reads the class when its own page, or any file colocated beside it,
 * resolves one — server-side through `classIdFromSearchParams`, or client-side
 * through `useActiveClass`. The colocated files matter: `/score/collect` reads
 * it only in its client, and `/yearly-report` only in `queries.ts`.
 */
const READERS = ['classIdFromSearchParams', 'useActiveClass(']

const readsClass = new Set<string>()
for (const file of files) {
  const route = routeOf(file)
  if (route === null) continue
  const dir = file.slice(0, file.lastIndexOf('/'))
  const colocated = files.filter((f) => f.startsWith(dir + '/') && !f.slice(dir.length + 1).includes('/'))
  if (colocated.some((f) => READERS.some((r) => read(f).includes(r)))) readsClass.add(route)
}

const undeclared = [...readsClass].filter((r) => !isClassScopedPath(r)).sort()
check(
  'no route resolves a class without being declared class-scoped',
  undeclared.length === 0,
  undeclared.length ? `add to CLASS_SCOPED_ROUTES: ${undeclared.join(', ')}` : '',
)

const allRoutes = new Set(files.map(routeOf).filter((r): r is string => r !== null))
// A declared prefix is satisfied by the route itself or by any route beneath
// it: `/attendance` has no page of its own, only `/attendance/monthly` and
// friends.
const unreal = CLASS_SCOPED_ROUTES.filter(
  (r) => ![...allRoutes].some((route) => route === r || route.startsWith(r + '/')),
).sort()
check(
  'every declared class-scoped route exists',
  unreal.length === 0,
  unreal.length ? `no page under: ${unreal.join(', ')}` : '',
)

// ------------------------------------------------------------- 2. the default
console.log('\n2. client and server agree on the default class:')

/**
 * Two homeroom classes in one academic year — legal since `/classroom` made a
 * second class routine, and the exact case where the old client rule and the
 * server rule disagreed. The server's answer is the *oldest*; the client's list
 * sort would have put `៥ក` first by name.
 */
const homerooms = [
  { id: 'a2', class_id: 'kaa', academic_year_id: 'y1', is_homeroom: true, created_at: '2027-01-15T00:00:00Z' },
  { id: 'a1', class_id: 'khor', academic_year_id: 'y1', is_homeroom: true, created_at: '2026-09-01T00:00:00Z' },
]
check(
  'the canonical default is the oldest homeroom, whatever order the rows arrive in',
  chooseAssignment(homerooms)?.id === 'a1' &&
    chooseAssignment([...homerooms].reverse())?.id === 'a1',
)

const teacherContext = read(join(root, 'lib/context/TeacherContext.tsx'))
check(
  'TeacherContext picks its default with chooseAssignment, not the display sort',
  teacherContext.includes("from '@/lib/utils/defaultClass'") &&
    teacherContext.includes('chooseAssignment(detailed)'),
  'the client must not restate the default-class rule — import it',
)
check(
  'TeacherContext accepts a class from the URL (syncFromClassId)',
  teacherContext.includes('syncFromClassId'),
)
check(
  'ClassParamSync is mounted in the (main) layout',
  read(join(root, 'app/(main)/layout.tsx')).includes('<ClassParamSync />'),
  'without it `?class=` renders one class under another class\'s name',
)

// ------------------------------------------------------------ 3. the surfaces
console.log('\n3. every navigation surface carries the class:')

const SURFACES = [
  'components/shell/Sidebar.tsx',
  'components/shell/MobileNav.tsx',
  'components/shell/RailFlyout.tsx',
  'components/shell/Breadcrumb.tsx',
  'components/shell/CommandPalette.tsx',
  'app/(main)/dashboard/FeatureGrid.tsx',
]

for (const surface of SURFACES) {
  const src = read(join(root, surface))
  check(`${surface} routes its links through useClassHref`, src.includes('useClassHref'))
}

/**
 * The bare-href check, and why it is worth the false-positive risk.
 *
 * A surface can import the hook and still add one hand-written
 * `href={module.href}` beside it — which is exactly how this regressed the
 * first time, one link at a time. So the surfaces are also required to have no
 * *unwrapped* nav href left.
 */
for (const surface of SURFACES) {
  const src = read(join(root, surface))
  const bare = [...src.matchAll(/href=\{(module|m|child|entry)\.href\}/g)].map((m) => m[0])
  check(`${surface} leaves no unwrapped nav href`, bare.length === 0, bare.join(', '))
}

// The dashboard is a server component and cannot use the hook; it applies the
// same pure function to the class its own figures were computed for.
const dashboard = read(join(root, 'app/(main)/dashboard/page.tsx'))
check(
  'the dashboard scopes its links to the class its figures came from',
  dashboard.includes('withClassParam(target, stats.classId)'),
)

/*
 * The Print Center is the same shape as the dashboard: a client screen handed
 * the class id the server already resolved, linking out to the screens that
 * print. It is checked for the SHARED helper specifically, because it shipped
 * with a hand-rolled one that appended `?class=` to every href without
 * consulting `CLASS_SCOPED_ROUTES` — which is how the parameter ends up in a
 * shared link for a page that does not read it.
 */
const printCenter = read(join(root, 'app/(main)/print-center/PrintCenterClient.tsx'))
check(
  'the print centre scopes its links through the shared withClassParam',
  printCenter.includes('withClassParam(href, classId)')
  && printCenter.includes("from '@/lib/utils/classHref'"),
)
check(
  'and does not hand-roll the class parameter beside it',
  !/class=\$\{encodeURIComponent/.test(printCenter),
)

// ------------------------------------------------------------- 4. the rewrite
console.log('\n4. withClassParam attaches the class honestly:')

check('a class-scoped route gains the class', withClassParam('/score/enter', 'c1') === '/score/enter?class=c1')
check(
  'existing parameters survive',
  withClassParam('/score/enter?month=nov', 'c1') === '/score/enter?month=nov&class=c1',
)
check(
  'a link that already names a class is left alone',
  withClassParam('/student-list?class=other', 'c1') === '/student-list?class=other',
)
check('a non-scoped route is untouched', withClassParam('/profile', 'c1') === '/profile')
check('no class means no parameter', withClassParam('/score/enter', null) === '/score/enter')
check('a fragment is preserved', withClassParam('/ranking#top', 'c1') === '/ranking?class=c1#top')
check(
  'a prefix match never eats a longer sibling name',
  !isClassScopedPath('/scoreboard') && isClassScopedPath('/score/total'),
)
check('nested routes inherit their prefix', isClassScopedPath('/attendance/monthly'))

// --------------------------------------------------------- 5. the context bar
console.log('\n5. the class is NAMED on the pages that are about a class:')

/**
 * Resolving the class correctly and telling the teacher which one it is are two
 * different properties, and Phase 0 found eleven screens with the first and not
 * the second. `ClassContextBar` is the one presentation of it.
 *
 * The property worth pinning is not that the component exists — it is that it
 * decides where to render from the SAME list `withClassParam` uses. A page that
 * carries `?class=` in its URL and a page that names the class on screen must
 * be the same set, or one of the two is lying about what it reads.
 */
const contextBar = read(join(root, 'components/shell/ClassContextBar.tsx'))
/** Comments explain the rules; only executable code can break them. */
// The `/*` must follow a delimiter or start a line — see the note in
// scripts/verify-page-frame.mts about `accept="image/*"`.
const contextBarCode = contextBar
  .replace(/(^|[\s{;,()=>])\/\*[\s\S]*?\*\//g, '$1')
  .replace(/^[ \t]*\/\/.*$/gm, '')

check('the context bar gates on isClassScopedPath',
  contextBarCode.includes('isClassScopedPath('),
  'the route list is declared once, in lib/utils/classHref.ts')
check('and declares no route list of its own',
  !/\[\s*['"`]\//.test(contextBarCode) && !contextBarCode.includes('CLASS_SCOPED_ROUTES'),
  'a second array of route prefixes is the drift this whole module exists to prevent')

check('it is presentation only — it never writes the active class',
  !contextBarCode.includes('setAssignmentId') &&
  !contextBarCode.includes('useSelectActiveClass') &&
  !contextBarCode.includes('syncFromClassId'),
  'ClassContextSwitcher in TopNav is the one authoritative selector')
check('and stores nothing of its own',
  !contextBarCode.includes('useState') && !contextBarCode.includes('localStorage'),
  'one active class, one source of truth')

check('a legacy account gets no strip rather than an invented one',
  contextBarCode.includes('isLegacy'),
  'a pre-V2 account has no class entity; a label over an absence is worse than nothing')
check('an unresolved grade prints an honest dash, never a derived number',
  contextBarCode.includes('ថ្នាក់ទី —') && !contextBarCode.includes('className.match'),
  'classes.name is free text by the time it reaches the client — deriving the grade back out is a guess')

/**
 * Grade reaches the client through the assignment read that was already
 * happening, not through a second query or a new column.
 */
check('grade rides along on the existing assignment select',
  teacherContext.includes('classes(name, grades(name, sort_order))'),
  'a per-assignment grade lookup would be an N+1 in the provider that wraps every page')
check('and is carried by the canonical grade column, sort_order',
  teacherContext.includes('grade.sort_order'),
  'the same invariant resolveClassTemplateContext relies on server-side')

// ------------------------------------------------------- 6. homework/send
console.log('\n6. publishing homework is about one class:')

/**
 * `/homework/send` was the last class-scoped workflow with no class at all: it
 * read `.eq('teacher_id', …)` and nothing else, so a teacher holding two
 * classes saw one merged list, and — because the parent-side policy matched on
 * the teacher — an assignment written for ៥ក was readable by ៦ក's parents too.
 */
const hwActions = read(join(root, 'app/(main)/homework/send/actions.ts'))
const hwPage = read(join(root, 'app/(main)/homework/send/page.tsx'))

check('/homework/send is declared class-scoped', isClassScopedPath('/homework/send'))
check('the page resolves the class server-side',
  hwPage.includes('classIdFromSearchParams(') && hwPage.includes('resolveServerScope('))
check('the actions re-validate it rather than trusting the caller',
  (hwActions.match(/resolveServerScope\(/g) ?? []).length >= 2,
  'a forged ?class= must resolve to the caller\'s own default, in the read AND the write')
check('the class is stamped from the resolved scope, never from the payload',
  hwActions.includes('class_id: scope.mode === \'v2\' ? scope.classId : null'),
  'class_id is an address — it decides which parents may read the row (00032)')
check('a legacy account still publishes without a class',
  /scope\.mode === 'v2' \? scope\.classId : null/.test(hwActions),
  'pre-V2 accounts keep exactly the reach they had')
check('and its list is not filtered by a class it does not have',
  /if \(scope\.mode === 'v2'\)/.test(hwActions),
  'the legacy branch must fall through to the unscoped query it always ran')
check('rows written before 00032 stay visible in every class',
  hwActions.includes('class_id.is.null'),
  'filtering them out would read as data loss')

console.log(
  failures === 0
    ? '\n✓ the active class travels: declared, defaulted, carried and named.'
    : `\n✗ ${failures} check(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
