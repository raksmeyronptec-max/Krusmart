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
import { existsSync } from 'node:fs'

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

const { NAV_MODULES, NAV_SECTIONS, MOBILE_PRIMARY_IDS, moduleForPath, primaryModules } =
  await import('../lib/navigation.ts')

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

// --- 2. path resolution -----------------------------------------------------------
// The sidebar highlight, the mobile bar and the breadcrumb all go through this.
console.log('\nthe room routes still resolve to it (sidebar, breadcrumb, mobile bar):')
for (const path of ['/cleaning-schedule', '/inventory', '/decorations']) {
  check(`${path} → facilities`, moduleForPath(path)?.id === 'facilities',
    `got ${moduleForPath(path)?.id}`)
}

console.log('\nno route the rename touched changed module:')
for (const [path, id] of [
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
check('no module still calls itself `classroom` by accident of the old meaning',
  !ids.includes('classroom') || byId('classroom')?.href === '/classroom',
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

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ navigation is coherent; the room module is `facilities` and no route moved.')
