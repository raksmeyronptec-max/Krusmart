/**
 * Every teacher route sits in the same frame.
 *
 *     node scripts/verify-page-frame.mts
 *
 * ── What this exists to stop ──────────────────────────────────────────────
 *
 * Phase 0 measured the seam: 16 of the 45 routes under `app/(main)/` used
 * `PageContainer` / `PageHeader`, and the other 29 hand-rolled a container
 * between them using SIX different content widths — `max-w-4xl`, `-5xl`,
 * `-6xl`, `-7xl`, `max-w-[1200px]`, `max-w-[1400px]` — each with its own `<h1>`
 * treatment, its own vertical rhythm and, in eleven cases, no mention of which
 * class it was showing. No individual screen was wrong. The product read as a
 * collection of pages because the joins between them did not line up.
 *
 * A style guide does not hold that line; a check does. The contract itself is
 * written at the top of `components/shell/PageContainer.tsx`, which is where
 * someone converting a route will actually read it. This file is the half that
 * fails the build.
 *
 * ── The five rules ────────────────────────────────────────────────────────
 *
 *   R1  the route renders inside `PageContainer`
 *   R2  it declares no page height or background of its own — the shell owns
 *       both (`AppShell` is `min-h-screen bg-bg-app`)
 *   R3  it titles itself through a declared header component, never a loose
 *       `<h1 className="kh-moul">`
 *   R4  a class-scoped route says WHICH class
 *   R5  it declares none of the six competing page columns
 *   R6  a fixed-millimetre sheet sits in a `.preview-scroll`
 *
 * ── Documents are not page columns ────────────────────────────────────────
 *
 * An A4 sheet legitimately has its own width, its own headings and its own
 * `@page` rules. Lines carrying a print marker (`print-sheet`,
 * `print-container`, `print-hide`, `no-print`, `print:`) are therefore removed
 * before R5 is applied, and R3 counts only headings outside them. What a sheet
 * must NOT do is wrap the whole route: `data-app-frame` gives `PageContainer`
 * `display: contents` under `@media print`, so a sheet inside it measures
 * exactly what it measured before the shell existed. Moving a printable screen
 * into the frame costs its printed output nothing — that is the property that
 * makes this migration safe, and `verify-students.mts` already guards the
 * catalogue side of it.
 *
 * Exits non-zero on any failure.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import * as nodeModule from 'node:module'

/** `lib/utils/classHref.ts` imports through `./scopeParam.ts` only, but keep the alias hook for symmetry with the other harnesses. */
type ResolveResult = { url: string; shortCircuit?: boolean }
type NextResolve = (specifier: string, context: unknown) => ResolveResult
const registerHooks = (
  nodeModule as unknown as {
    registerHooks?: (hooks: {
      resolve: (s: string, c: unknown, n: NextResolve) => ResolveResult
    }) => void
  }
).registerHooks

if (!registerHooks) {
  console.error('needs node 22.15+ for module.registerHooks (to resolve the `@/` alias)')
  process.exit(1)
}

const root = fileURLToPath(new URL('../', import.meta.url))
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      for (const ext of ['', '.ts', '.tsx', '/index.ts']) {
        const candidate = new URL(specifier.slice(2) + ext, new URL('../', import.meta.url))
        if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

const { isClassScopedPath } = await import('../lib/utils/classHref.ts')

const MAIN = join(root, 'app', '(main)')

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const files = walk(MAIN).filter((f) => f.endsWith('.tsx'))

/**
 * A route's own source: its `page.tsx` plus every `.tsx` beside it.
 *
 * Colocated by convention (`<Feature>Client.tsx`, its panels), so the frame may
 * live in any of them — `/student-list` opens it in `StudentTableClient`, not
 * in `page.tsx`. Files in SUBdirectories belong to the nested route and are not
 * read here, or `/yearly-report` would inherit its three sheets' markup.
 */
function ownFiles(routeDir: string): string[] {
  return files.filter((f) => dirname(f) === routeDir)
}

/**
 * ...plus any component it pulls in from a sibling or parent route directory.
 *
 * `/yearly-report/promoted` renders `../ReportFrame`, which is where its
 * `PageContainer`, its `PageHeader` and its `ClassContextBar` actually live —
 * three sub-reports sharing one frame is the good version of this, not a way
 * around the rule. Reading only the route's own directory would report all
 * three as bare while the frame sat one level up.
 *
 * Relative specifiers only, and only within `app/(main)`: a `@/components/...`
 * import is shared UI, and following those would drag half the design system
 * into every route's source.
 */
function frameFiles(routeDir: string): string[] {
  const seen = new Set<string>()
  // Transitive, because the hop is not always direct: `/yearly-report/promoted`
  // renders `../PromotionListClient`, which renders `./ReportFrame`, which is
  // where the frame actually is. Bounded, so a cycle cannot spin.
  let frontier = ownFiles(routeDir)
  for (let depth = 0; depth < 3 && frontier.length > 0; depth++) {
    const next: string[] = []
    for (const f of frontier) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        const base = join(dirname(f), m[1])
        if (!base.startsWith(MAIN)) continue
        for (const ext of ['.tsx', '/index.tsx']) {
          const candidate = base + ext
          if (!existsSync(candidate)) continue
          if (dirname(candidate) === routeDir) continue // already own
          if (seen.has(candidate)) continue
          seen.add(candidate)
          next.push(candidate)
        }
      }
    }
    frontier = next
  }
  return [...seen]
}

/**
 * Lines that are part of a printed document rather than the screen frame.
 *
 * `[\w-]*sheet` rather than a list of sheet class names: `print-sheet`,
 * `score-sheet` and `print-container` are all the same idea, and enumerating
 * them would mean this file had to be edited every time a document was added.
 */
const PRINT_MARKER = /[\w-]*sheet|print-container|print-hide|no-print|print:|@page|@media print/

/**
 * Files that ARE a document rather than a screen that contains one.
 *
 * `ScoreTotalPrint.tsx` and `HomeworkPrintSheet.tsx` are A4 markup end to end —
 * their headings are the document's title and their width is the paper's, not a
 * page column. A mixed file (a control panel above a sheet, which most of the
 * printable screens are) is still read line by line.
 */
const DOCUMENT_FILE = /(Print|Sheet|PrintSheet)\.tsx$/

/**
 * Files that DEFINE a declared header component.
 *
 * `HomeworkEntryHeader.tsx` is colocated with its route, so its `<h1>` would
 * otherwise be read as the hand-rolled title the rule exists to catch. The
 * header components are exactly where a `kh-moul` `<h1>` belongs.
 */
const HEADER_FILE = /(PageHeader|WorkspaceHeader|EntryHeader)\.tsx$/

function screenOnly(src: string): string {
  return src
    .split('\n')
    .filter((line) => !PRINT_MARKER.test(line))
    .join('\n')
}

/**
 * Comments explain the rules; only executable code can break them.
 *
 * The `/\*` must follow a delimiter or start a line. A naive
 * `/\/\*[\s\S]*?\*\//` also matches the `/*` inside `accept="image/*"`, and
 * then runs to the next real `*\/` — swallowing thirty lines of JSX, including
 * whatever the check was looking for, and passing a route that should fail.
 */
function code(src: string): string {
  return src
    .replace(/(^|[\s{;,()=>])\/\*[\s\S]*?\*\//g, '$1')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

/**
 * Routes that are a `redirect()` and nothing else.
 *
 * `/classroom/classes` → `/classroom` and `/score/template` → `/score/subjects`.
 * They render no UI at all, so there is no frame for them to conform to; they
 * stay declared in `lib/navigation.ts` as `hidden` so the breadcrumb resolves
 * mid-redirect. Detected rather than listed, so retiring one needs no edit here.
 */
function isPureRedirect(pageSrc: string, own: string[]): boolean {
  if (own.length !== 1) return false
  const body = code(pageSrc)
  // Renders no element at all, and hands off with `redirect()`. Detected by the
  // absence of a closing or self-closing tag rather than of a `<`, because
  // `searchParams?: Promise<Record<…>>` is a generic, not JSX. Written as a
  // property of the source rather than a list of routes, so retiring one of
  // these needs no edit here.
  return /\bredirect\(/.test(body) && !/<\/[A-Za-z]|\/>/.test(body)
}

/** The six page columns Phase 0 measured. `2xl` and below are component widths. */
const COMPETING_COLUMN =
  /mx-auto[^"'`]*max-w-(4xl|5xl|6xl|7xl|\[\d+px\])|max-w-(4xl|5xl|6xl|7xl|\[\d+px\])[^"'`]*mx-auto/

/** A sheet sized in real paper units — A4 portrait or landscape. */
const FIXED_SHEET = /w-\[(21cm|297mm|29\.7cm|210mm)\]|max-w-\[(21cm|297mm)\]/

/** A route titles itself through one of these, never a loose heading. */
const HEADERS = ['PageHeader', 'ScoreWorkspaceHeader', 'HomeworkEntryHeader']

/** These say which class as richly as `ClassContextBar` does; a second strip would repeat them. */
const CONTEXT_PROVIDERS = ['ClassContextBar', 'ScoreWorkspaceHeader', 'HomeworkEntryHeader']

/**
 * A region whose accessible name announces it AS the context — `បរិបទ…`.
 *
 * Two screens resolve their class on the SERVER and state it from there rather
 * than from `TeacherContext`, and both are right to:
 *
 *   /dashboard      the class it names must be the one its forty-two pupils and
 *                   7.4 average were computed for, and it hides the region
 *                   entirely for a teacher with no class yet — a bar reading
 *                   "ថ្នាក់ —" above a banner offering to create one states the
 *                   problem twice and answers it neither time.
 *   /print-center   same server resolution, plus a third state the shared
 *                   component has no way to express: a pre-V2 account is scoped
 *                   to its roster rather than to a class, and the bar says
 *                   "សិស្សរបស់អ្នក" instead of pretending to a class.
 *
 * Neither behaviour is expressible in `ClassContextBar`, so both keep their own
 * and DECLARE it, rather than being special-cased by route here. The rule this
 * enforces is the one R4 is actually about — does the page tell the teacher
 * which class it is showing — and a landmark whose accessible name is "the
 * context" is that statement made to assistive technology as well as to the
 * eye. It is not a way to opt out of naming the class.
 */
const CONTEXT_LANDMARK = /aria-label="បរិបទ/

interface Offence {
  route: string
  rule: string
  detail: string
}

const offences: Offence[] = []
let routes = 0
let redirects = 0

for (const page of files.filter((f) => /(^|\/)page\.tsx$/.test(f)).sort()) {
  const routeDir = dirname(page)
  const route = '/' + relative(MAIN, routeDir).replace(/\\/g, '/')
  const own = [...ownFiles(routeDir), ...frameFiles(routeDir)]
  const pageSrc = readFileSync(page, 'utf8')

  if (isPureRedirect(pageSrc, own)) {
    redirects += 1
    continue
  }

  routes += 1
  const src = own.map((f) => readFileSync(f, 'utf8')).join('\n')
  const executable = code(src)

  // Screen markup only: documents are excluded whole-file where the file IS a
  // document, and line by line where a screen merely contains one.
  const screen = screenOnly(
    own
      .filter((f) => !DOCUMENT_FILE.test(f))
      .map((f) => code(readFileSync(f, 'utf8')))
      .join('\n'),
  )

  /** The same, minus the files that define a declared header component. */
  const authored = screenOnly(
    own
      .filter((f) => !DOCUMENT_FILE.test(f) && !HEADER_FILE.test(f))
      .map((f) => code(readFileSync(f, 'utf8')))
      .join('\n'),
  )

  const add = (rule: string, detail: string) => offences.push({ route, rule, detail })

  // R1 -----------------------------------------------------------------------
  if (!executable.includes('<PageContainer')) add('R1', 'renders no PageContainer')

  // R2 -----------------------------------------------------------------------
  if (/min-h-screen/.test(screen)) {
    add('R2', 'declares min-h-screen — AppShell already is')
  }

  // R3 -----------------------------------------------------------------------
  if (!HEADERS.some((h) => executable.includes(`<${h}`))) {
    add('R3', `no declared header (${HEADERS.join(' / ')})`)
  }
  const looseTitle = authored.match(/<h1[^>]*kh-moul/)
  if (looseTitle) add('R3', 'hand-rolled <h1 className="kh-moul"> outside a print sheet')

  // R4 -----------------------------------------------------------------------
  const namesClass =
    CONTEXT_PROVIDERS.some((c) => executable.includes(`<${c}`)) || CONTEXT_LANDMARK.test(executable)
  if (isClassScopedPath(route) && !namesClass) {
    add('R4', 'class-scoped but never names the class')
  }

  // R5 -----------------------------------------------------------------------
  const column = screen.match(COMPETING_COLUMN)
  if (column) add('R5', `competing page column: ${column[0].trim().slice(0, 60)}`)

  // R6 -----------------------------------------------------------------------
  // A sheet fixed at 21cm / 297mm is ~794 / ~1122 CSS pixels — two to three
  // times a phone's viewport. Without a scroll container the PAGE BODY scrolls
  // sideways, dragging the navigation and every control off-screen with it, and
  // `PageContainer`'s padding does not change that. `.preview-scroll` confines
  // the overflow to the sheet, and `globals.css` sets it to `overflow: visible`
  // under `@media print` so pagination is untouched.
  if (FIXED_SHEET.test(executable) && !executable.includes('preview-scroll')) {
    add('R6', 'a fixed-millimetre sheet with no .preview-scroll container')
  }
}

// ---------------------------------------------------------------------- report
console.log(`\nthe page frame, across ${routes} routes (${redirects} pure redirects skipped):`)

const byRoute = new Map<string, Offence[]>()
for (const o of offences) {
  byRoute.set(o.route, [...(byRoute.get(o.route) ?? []), o])
}

const RULES: Record<string, string> = {
  R1: 'renders inside PageContainer',
  R2: 'declares no page height or background of its own',
  R3: 'titles itself through a declared header component',
  R4: 'a class-scoped route says which class',
  R5: 'declares none of the six competing page columns',
  R6: 'keeps a fixed-millimetre sheet inside a .preview-scroll',
}

for (const [rule, label] of Object.entries(RULES)) {
  const hits = offences.filter((o) => o.rule === rule)
  check(`${rule}  every route ${label}`, hits.length === 0,
    hits.map((h) => `${h.route} — ${h.detail}`).join('\n      '))
}

console.log(
  failures === 0
    ? `\n✓ ${routes} routes, one frame.`
    : `\n✗ ${byRoute.size} route(s) outside the frame, ${offences.length} offence(s)`,
)
process.exit(failures === 0 ? 0 : 1)
