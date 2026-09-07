/**
 * The product is one system: every route reachable, every teacher screen
 * wearing the same shell, and no second navigation list anywhere.
 *
 *     node scripts/verify-ux-consistency.mts
 *
 * These are the properties that decay by accretion rather than by breakage. A
 * new route added without a navigation entry works perfectly — until a teacher
 * has to be told its URL. A page that renders its own container works too,
 * until it prints differently from every other page. Neither shows up in a
 * build, a type check, or a review of the file that caused it.
 *
 * Exits non-zero on any failure.
 */

import * as nodeModule from 'node:module'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

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
    const base = specifier.startsWith('@/')
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

const { NAV_SECTIONS, moduleForPath, searchEntries } = await import('../lib/navigation.ts')

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

const read = (p: string) => readFileSync(p, 'utf8')
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const f = join(dir, e)
    return statSync(f).isDirectory() ? walk(f) : [f]
  })
}

const files = walk(MAIN)
const pages = files.filter((f) => f.endsWith('page.tsx'))

/** `app/(main)/students/[id]/page.tsx` → `/students/x` — a resolvable path. */
function routeOf(page: string): string {
  const segs = relative(MAIN, page).replace(/\/?page\.tsx$/, '').split('/').filter(Boolean)
  return '/' + segs
    .filter((s) => !s.startsWith('('))
    .map((s) => (s.startsWith('[') ? 'x' : s))
    .join('/')
}

// ------------------------------------------------------- 1. nothing is orphaned
console.log('\n1. every route is reachable:')

const unreachable = pages.map(routeOf).filter((r) => !moduleForPath(r)).sort()
check(
  'every page resolves to a navigation module',
  unreachable.length === 0,
  unreachable.length
    ? `declare these in lib/navigation.ts (hidden: true if reached from a row):\n      ${unreachable.join('\n      ')}`
    : '',
)

const declared = NAV_SECTIONS.flatMap((s) => s.modules).flatMap((m) => [
  m.href, ...(m.children ?? []).map((c) => c.href),
])
// A declared href may carry a query (`/print-center?category=student`) or name
// a dynamic parent (`/students`); both are resolved by path, so compare paths.
const missingPages = [...new Set(declared.map((h) => h.split('?')[0]))]
  .filter((h) => !existsSync(join(MAIN, h.replace(/^\//, ''), 'page.tsx')))
  .filter((h) => !pages.some((p) => routeOf(p).startsWith(h + '/')))
  .sort()
check(
  'and every declared destination exists',
  missingPages.length === 0,
  missingPages.join(', '),
)

const entries = searchEntries()
check(
  'the command palette can reach every listed destination',
  entries.length > 0 && entries.every((e) => e.href.startsWith('/')),
)

// --------------------------------------------------------- 2. one shell, one frame
console.log('\n2. the shell is owned by the layout, not by the pages:')

const ownTopNav = files.filter((f) => /<TopNav[\s/>]/.test(read(f)))
check(
  'no page renders its own TopNav',
  ownTopNav.length === 0,
  'app/(main)/layout.tsx owns it — a second one double-renders the class switcher',
)

/**
 * A second hand-maintained list of destinations.
 *
 * The dashboard carried one for a long time: 29 tiles with their own labels,
 * their own permission flag and their own search box beside the command
 * palette's, drifting quietly out of step with `lib/navigation.ts`. Anything
 * that walks a literal array of `{label, url}` is that pattern coming back.
 */
const NAV_SHAPED = /\{\s*(name|label)\s*:\s*['"`][^'"`]+['"`]\s*,[^}]*\b(url|href)\s*:\s*['"`]\//
const secondMenus = files
  .filter((f) => !f.endsWith('/navigation.ts'))
  .filter((f) => {
    const src = read(f)
    // Three or more literal destinations in one array is a menu, not a link.
    return (src.match(new RegExp(NAV_SHAPED.source, 'g')) ?? []).length >= 3
  })
  .map((f) => relative(root, f))
/**
 * Known, deliberate destination lists that are NOT navigation menus.
 * Each is a set of actions belonging to one screen, not a way around the app.
 */
const ALLOWED_LISTS = new Set([
  'app/(main)/dashboard/page.tsx',          // five quick actions, class-scoped
  'app/(main)/classroom/ClassroomClient.tsx', // per-class tools on a card
  'app/(main)/students/[id]/page.tsx',       // per-pupil actions
])
const unexpected = secondMenus.filter((f) => !ALLOWED_LISTS.has(f)).sort()
check(
  'no page carries a second navigation list',
  unexpected.length === 0,
  unexpected.length
    ? `derive from lib/navigation.ts, or record it in ALLOWED_LISTS:\n      ${unexpected.join('\n      ')}`
    : '',
)
const staleAllowances = [...ALLOWED_LISTS].filter((f) => !secondMenus.includes(f)).sort()
check('and no allowance outlives the list it excused', staleAllowances.length === 0,
  staleAllowances.join(', '))

// ------------------------------------------------ 3. the class is named, not assumed
console.log('\n3. class-scoped hubs say which class they are about:')

/**
 * Screens whose whole subject is one class's records. Each must NAME the class
 * — §13's second question — because every one of them is wrong in a way a
 * teacher cannot see if it silently resolves the default class.
 */
const MUST_NAME_CLASS: [string, string][] = [
  ['app/(main)/dashboard/page.tsx', 'stats.className'],
  ['app/(main)/print-center/PrintCenterClient.tsx', 'className'],
  ['app/(main)/class-admin/page.tsx', 'className'],
  ['app/(main)/enrollment/page.tsx', 'className'],
  ['app/(main)/classroom/ClassroomClient.tsx', 'cls.className'],
]
for (const [file, needle] of MUST_NAME_CLASS) {
  check(`${relative('app/(main)', file)} names the class`, read(join(root, file)).includes(needle))
}

check(
  'the score workspace header names it for every score screen',
  read(join(root, 'components/score/ScoreWorkspaceHeader.tsx')).includes('className'),
)

// ------------------------------------------------------- 4. the record book
console.log('\n4. the record book prints the class’s own curriculum:')

const recordBook = read(join(MAIN, 'record-book/RecordBookClient.tsx'))
check(
  'its columns come from the class template',
  recordBook.includes('useScoreTemplate(') && recordBook.includes('templateSubjects'),
  'it hard-coded thirteen primary columns, so a secondary class printed blanks',
)
check(
  'the compiled-in list survives only as a named fallback',
  recordBook.includes('FALLBACK_SUBJECTS') && !recordBook.includes('const SUBJECTS:'),
)
check(
  'worded columns are split by type, not by a name prefix',
  recordBook.includes("column.type === 'select'"),
)

// --------------------------------------------------- 5. teacher management
console.log('\n5. an assignment can be undone:')

const teachersTable = read(join(root, 'app/admin/teachers/TeachersTable.tsx'))
check('the console calls removeAssignment', teachersTable.includes('removeAssignment('))
check('it confirms before removing', teachersTable.includes('confirm('))
check('and the row says which subject, not just which class',
  teachersTable.includes('subjectLabels'),
  'a secondary teacher holding three subjects in one class saw that class three times')
check('the action is still permission-gated and audited',
  /removeAssignment[\s\S]{0,400}requirePermission\('teachers:update'\)/.test(
    read(join(root, 'app/admin/actions.ts')),
  ))

console.log(
  failures === 0
    ? '\n✓ one navigation tree, one shell, one class named on every hub.'
    : `\n✗ ${failures} check(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
