/**
 * The navigation tree, checked against the real module.
 *
 *     node scripts/verify-navigation.mts
 *
 * `NavModule.id` is not persisted anywhere — no database column, no URL, no
 * storage key — so renaming one is free. "Free" is a claim about the whole
 * codebase though, and the way it stops being true is quiet: a component that
 * compares an id to a *literal* instead of to another module's id. `Breadcrumb`
 * does exactly that for `"dashboard"`. This checks the invariants that make the
 * rename safe rather than trusting that nobody added a second literal.
 *
 * `lib/navigation.ts` imports through the `@/` alias, which node does not
 * resolve on its own, so a resolve hook maps it to the project root. The point
 * is to exercise the real tree: a regex over the source would pass on a file
 * that does not even parse.
 *
 * Exits non-zero on any failure.
 */

import * as nodeModule from 'node:module'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)

/**
 * `module.registerHooks` is Node 22.15+/23.5+, but this repo pins
 * `@types/node@^20`, which does not declare it. Reached through a narrow cast
 * rather than by bumping the types — a dev harness must not move a dependency
 * the app builds against — and guarded at runtime so an older node says why it
 * cannot run instead of failing on an unresolved `@/` import.
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
  console.error('needs node 22.15+ for module.registerHooks (to resolve the `@/` alias)')
  process.exit(1)
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const base = new URL(specifier.slice(2), root)
      for (const ext of ['', '.ts', '.tsx', '/index.ts']) {
        const candidate = new URL(base.href + ext)
        if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

const {
  NAV_MODULES, NAV_SECTIONS, MOBILE_PRIMARY_IDS, moduleForPath, primaryModules,
  searchEntries, sectionsForRoles,
} = await import('../lib/navigation.ts')

/** What the command palette AND the dashboard's feature grid would offer these roles. */
const searchEntriesFor = (roles: string[]) => searchEntries(sectionsForRoles(roles as never))

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

const byId = (id: string) => NAV_MODULES.find((m) => m.id === id)

// --- 1. the rename ----------------------------------------------------------------
console.log('\nthe room module is `facilities`, not `classroom`:')

const facilities = byId('facilities')
check('a module with id `facilities` exists', Boolean(facilities))
check('labelled បរិក្ខារថ្នាក់', facilities?.label === 'បរិក្ខារថ្នាក់', `got ${facilities?.label}`)
check(
  'still lands on /cleaning-schedule — the rename moves no route',
  facilities?.href === '/cleaning-schedule',
  `got ${facilities?.href}`,
)
check(
  'still holds all three room pages',
  ['/cleaning-schedule', '/inventory', '/decorations'].every((h) =>
    facilities?.children?.some((c) => c.href === h),
  ),
)
check(
  'reachable by typing `classroom`, which is how teachers found it',
  (facilities?.alias ?? '').includes('classroom'),
)

// --- 1b. the new module -----------------------------------------------------------
console.log('\nthe class module took the `classroom` id:')

const classroom = byId('classroom')
check('a module with id `classroom` exists', Boolean(classroom))
check('labelled ថ្នាក់ និងសិស្ស', classroom?.label === 'ថ្នាក់ និងសិស្ស', `got ${classroom?.label}`)
check('points at /classroom', classroom?.href === '/classroom', `got ${classroom?.href}`)
check('it is not the room module wearing a new label',
  classroom?.href !== '/cleaning-schedule')
// `/classroom` is the class manager itself since the hub was merged into it, so
// it must be the primary child — the sidebar's default target for the module.
check('the primary child is /classroom itself',
  classroom?.children?.find((c) => c.primary)?.href === '/classroom',
  `got ${classroom?.children?.find((c) => c.primary)?.href}`)
// The old route redirects; it stays declared so the breadcrumb and the sidebar
// highlight resolve during the redirect rather than blanking, and stays hidden
// so the sidebar does not list one screen twice.
check('still declares /classroom/classes, hidden, for the redirect',
  Boolean(classroom?.children?.some((c) => c.href === '/classroom/classes' && c.hidden === true)))

// The hub links to these; it must not *own* them. Two PATH_INDEX entries for one
// href would make the sidebar highlight whichever the longest-match sort reached
// first, so `/student-list` could start lighting up ថ្នាក់ និងសិស្ស instead of សិស្ស.
console.log('\nthe hub groups, it does not relocate:')
for (const [href, owner] of [
  ['/student-list', 'students'],
  ['/enrollment', 'students'],
  ['/score/subjects', 'scores'],
] as const) {
  check(`${href} is still owned by ${owner}`, moduleForPath(href)?.id === owner,
    `got ${moduleForPath(href)?.id}`)
  check(`${href} is not declared under classroom`,
    !classroom?.children?.some((c) => c.href === href))
}

check(
  'every classroom child is a /classroom route',
  (classroom?.children ?? []).every((c) => c.href === '/classroom' || c.href.startsWith('/classroom/')),
)

// --- 2. path resolution -----------------------------------------------------------
// The sidebar highlight, the mobile bar and the breadcrumb all go through this.
console.log('\nthe room routes still resolve to it (sidebar, breadcrumb, mobile bar):')
for (const path of ['/cleaning-schedule', '/inventory', '/decorations']) {
  check(`${path} → facilities`, moduleForPath(path)?.id === 'facilities',
    `got ${moduleForPath(path)?.id}`)
}

console.log('\nno route the rename touched changed module:')
for (const [path, id] of [
  ['/classroom', 'classroom'],
  ['/classroom/classes', 'classroom'],
  ['/dashboard', 'dashboard'],
  ['/student-list', 'students'],
  ['/students/abc-123', 'students'],
  ['/score/subjects', 'scores'],
  ['/enrollment', 'students'],
  ['/class-admin', 'documents'],
  ['/print-center', 'reports'],
] as const) {
  check(`${path} → ${id}`, moduleForPath(path)?.id === id, `got ${moduleForPath(path)?.id}`)
}

// --- 3. structural invariants -----------------------------------------------------
console.log('\nthe tree is still coherent:')

const ids = NAV_MODULES.map((m) => m.id)
check('module ids are unique', new Set(ids).size === ids.length,
  `${ids.length} modules, ${new Set(ids).size} distinct`)
check('the `classroom` id belongs to the class module, not the room one',
  byId('classroom')?.href === '/classroom',
  `classroom → ${byId('classroom')?.href}`)

check(
  'every MOBILE_PRIMARY_IDS entry names a real module',
  MOBILE_PRIMARY_IDS.every((id: string) => Boolean(byId(id))),
  `unresolved: ${MOBILE_PRIMARY_IDS.filter((id: string) => !byId(id)).join(', ')}`,
)
check(
  'the mobile bar still fills every slot',
  primaryModules().length === MOBILE_PRIMARY_IDS.length,
  `${primaryModules().length} of ${MOBILE_PRIMARY_IDS.length}`,
)
check(
  'MOBILE_PRIMARY_IDS never named the renamed module',
  !(MOBILE_PRIMARY_IDS as readonly string[]).includes('facilities'),
)

check(
  'NAV_MODULES is exactly the sections flattened',
  NAV_MODULES.length === NAV_SECTIONS.flatMap((s) => s.modules).length,
)
check(
  "every module's own href resolves back to it",
  NAV_MODULES.every((m) => moduleForPath(m.href)?.id === m.id),
  NAV_MODULES.filter((m) => moduleForPath(m.href)?.id !== m.id).map((m) => m.id).join(', '),
)
check(
  'every child href resolves to its own module',
  NAV_MODULES.every((m) => (m.children ?? []).every((c) => moduleForPath(c.href)?.id === m.id)),
)

// --- 3b. results is a step of the journey, and now a module ------------------
console.log('\nលទ្ធផល is its own module, and the score routes split cleanly:')

const results = byId('results')
check('a module with id `results` exists', Boolean(results))
check('labelled លទ្ធផល', results?.label === 'លទ្ធផល', `got ${results?.label}`)
check('it opens on the ranking table', results?.href === '/ranking', `got ${results?.href}`)

/**
 * Ranking, completion, analysis and the honour roll were `hidden: true`
 * children of ពិន្ទុ or របាយការណ៍ — reachable from a card or another screen,
 * from no menu at all. The whole RESULTS step of the teacher's journey was
 * unrepresented in navigation.
 */
for (const href of ['/ranking', '/score/collect', '/score-analyse', '/honor-roll']) {
  check(`${href} is offered by លទ្ធផល, not hidden in another module`,
    moduleForPath(href)?.id === 'results' &&
    Boolean(results?.children?.some((c) => c.href === href && !c.hidden)),
    `resolves to ${moduleForPath(href)?.id}`)
}

/**
 * ពិន្ទុ opens where the WORK is, the same correction វត្តមាន already had: its
 * front door was moved off the read-only monthly sheet onto the register.
 */
const scores = byId('scores')
check('ពិន្ទុ opens on the entry grid, not the totals table',
  scores?.href === '/score/enter', `got ${scores?.href}`)
check('and its primary child agrees',
  scores?.children?.find((c) => c.primary)?.href === '/score/enter')
check('/score/total stays in ពិន្ទុ — its matrix is editable, so it is still marking',
  moduleForPath('/score/total')?.id === 'scores', `got ${moduleForPath('/score/total')?.id}`)

/**
 * One href, one module. Two entries in `PATH_INDEX` for one path would make the
 * sidebar highlight whichever the longest-match sort happened to reach first.
 */
const allHrefs = NAV_MODULES.flatMap((m) => [m.href, ...(m.children ?? []).map((c) => c.href)])
const dupes = allHrefs.filter((h, i) => allHrefs.indexOf(h) !== i && !h.includes('?'))
const crossModule = [...new Set(dupes)].filter((h) => {
  const owners = new Set(
    NAV_MODULES.filter((m) => m.href === h || (m.children ?? []).some((c) => c.href === h)).map((m) => m.id),
  )
  return owners.size > 1
})
check('no href is claimed by two modules', crossModule.length === 0, crossModule.join(', '))

/**
 * `/score-analysis/subject` redirects to `/score-analyse` since the two
 * analyses became two views of one screen. Declared but not offered, so the
 * breadcrumb resolves mid-redirect and the menu shows one analysis, not two
 * whose names differ by a letter.
 */
const subjectAnalysis = (results?.children ?? []).find((c) => c.href === '/score-analysis/subject')
check('the old subject-analysis route is declared but hidden',
  subjectAnalysis?.hidden === true)
check('and the palette offers exactly one analysis destination',
  searchEntriesFor(['teacher']).filter((e) => e.href.startsWith('/score-analy')).length === 1,
  searchEntriesFor(['teacher']).filter((e) => e.href.startsWith('/score-analy')).map((e) => e.href).join(', '))

// --- 4. nothing in the rail may show invented numbers ------------------------
console.log('\nthe mock analytics screen is declared but never offered:')

/**
 * `/administration` renders `MOCK_SCHOOL_STATS`, `MOCK_TEACHERS` and
 * `MOCK_TEACHER_DETAIL`. Its role gate is correct, but a gate decides *who* may
 * see a screen and never whether its figures are real — so a principal was
 * being handed a school-analytics dashboard that invents everything on it.
 *
 * `hidden`, not deleted: the route keeps working and `moduleForPath` keeps
 * resolving it, so an administrator who arrives by URL still gets a breadcrumb.
 * The same pattern `/score/template` and `/classroom/classes` use.
 */
const adminLink = NAV_MODULES.flatMap((m) => m.children ?? []).find(
  (c) => c.href === '/administration',
)
check('it is still declared, so the breadcrumb resolves', Boolean(adminLink))
check('but hidden from every rendered navigation surface',
  adminLink?.hidden === true,
  'the sidebar, the rail flyout, the command palette and the dashboard grid all filter `hidden`')
check('and keeps its permission gate as well',
  adminLink?.permission === 'school_settings:view',
  'hidden decides what is offered; the gate is what survives if it is offered again')
check('moduleForPath still resolves it', moduleForPath('/administration')?.id === 'reports',
  `got ${moduleForPath('/administration')?.id}`)

/**
 * The searchable set is what the command palette AND the dashboard's
 * "មុខងារទាំងអស់" grid both render, since both call `searchEntries`. Checked for
 * an administrator specifically: a teacher never had the permission, so testing
 * only their view would pass vacuously.
 */
for (const roles of [['teacher'], ['owner'], ['principal'], ['school_admin']] as const) {
  check(`not offered to ${roles[0]}`,
    !searchEntriesFor([...roles]).some((e) => e.href === '/administration'))
}

/*
 * ── Phase 11: hidden is not a gate ────────────────────────────────────────
 *
 * `hidden: true` stopped `/administration` being OFFERED. It never stopped it
 * being REACHED, and the brief is explicit that navigation visibility is never
 * security. The screen behind it invented a school of 1,250 pupils, so the
 * remaining exposure was a principal typing the URL and reading fiction.
 *
 * It is a redirect to `/admin/dashboard` now — the same six counters computed
 * from the administrator's own school. These checks pin both halves: no mock
 * survives, and the actor check still runs before the redirect so a parent is
 * not bounced through the admin tree to be told no.
 */
const administrationDir = fileURLToPath(new URL('app/(main)/administration/', root))
const administrationFiles = readdirSync(administrationDir)
check('the mock school-analytics screen is gone',
  !administrationFiles.includes('AdministrationClient.tsx'),
  administrationFiles.join(', '))
/** Comments stripped: the replacement page NAMES the constants it replaced. */
const stripComments = (src: string) =>
  src
    .replace(/(^|[\s{;,()=>])\/\*[\s\S]*?\*\//g, '$1')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1')
check('...and nothing under (main) still declares MOCK_ constants',
  !readdirSync(administrationDir)
    .some((f) => /MOCK_/.test(stripComments(readFileSync(administrationDir + f, 'utf8')))),
  'a screen a principal can reach must not invent its figures')

const administrationPage = readFileSync(administrationDir + 'page.tsx', 'utf8')
check('/administration redirects to the real overview',
  /redirect\('\/admin\/dashboard'\)/.test(administrationPage))
check('...and still refuses a non-administrator first',
  administrationPage.indexOf("actor.kind !== 'admin'") <
    administrationPage.indexOf("redirect('/admin/dashboard')"),
  'the gate must run before the hand-off, not after it')

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ navigation is coherent; the room module is `facilities` and no route moved.')
