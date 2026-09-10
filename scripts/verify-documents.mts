/**
 * A sheet is paper, and it says so once.
 *
 *     node scripts/verify-documents.mts
 *
 * ── What this exists to stop ──────────────────────────────────────────────
 *
 * Eleven screens in `app/(main)/` render an A4 sheet, and they held two
 * contradictory theories of what one is:
 *
 *   A · a sheet is paper — `bg-white text-black`, both themes, screen and
 *       paper. Nine screens.
 *   B · a sheet is a themed card that becomes paper when printed —
 *       `bg-bg-surface print:bg-white`. `/yearly-report`'s three sheets and
 *       `/attendance/yearly`.
 *
 * Neither was written down, so every screen picked one and then wrote a
 * fragment of the other, and each fragment failed silently — in one theme only,
 * or only on paper:
 *
 *   /print-list          declared the ground and not the ink, so 202 names and
 *                        numbers inherited `--foreground`: near-white on white.
 *   .report-table th     hard-coded `#f1f5f9` inside a *themed* sheet — 73 more
 *   .abs-table th        header cells doing the same across four sub-reports.
 *   /inventory           `bg-bg-surface text-black` — the reverse: black ink on
 *   /cleaning-schedule   a navy sheet, which also **prints** navy, because a
 *                        ground on the element survives `@media print` and
 *                        `print-color-adjust: exact` is on.
 *
 * A won: a document screen is a preview of a printed thing, so the paper on
 * screen must be the paper that comes out of the printer. The contract now
 * lives in `app/globals.css` under `@layer components` — components and not
 * utilities, so a sheet that means something else by its ink (`/ranking` prints
 * navy) still says so with a utility class and still wins the cascade.
 *
 * ── The five rules ────────────────────────────────────────────────────────
 *
 *   D1  the contract is declared exactly once, and names a ground AND an ink
 *   D2  every fixed-millimetre sheet carries a sheet class, or declares both
 *       halves itself
 *   D3  no sheet grounds itself in a theme token — paper does not follow the
 *       theme, and it is the print that proves it
 *   D4  no `bg-brand-100` + `text-brand` pair without a dark override: the ramp
 *       is fixed by design and `--brand` is not, so the two halves do not move
 *       together
 *   D5  the retired brand literal is gone from rendered code
 *
 * Exits non-zero on any failure.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))

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

/**
 * Source with comments removed.
 *
 * The leading-character guard is load-bearing and was a real defect in three
 * other harnesses: a bare `/\/\*[\s\S]*?\*\//` also matches the `/*` inside
 * `accept="image/*"`, swallowing everything up to the next `*​/` — which can as
 * easily make a rule pass silently as fail it.
 */
const code = (s: string) =>
  s
    .replace(/(^|[\s{;,()=>])\/\*[\s\S]*?\*\//g, '$1')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1')

const tsx = walk(join(root, 'app'))
  .concat(walk(join(root, 'components')))
  .filter((f) => f.endsWith('.tsx'))

const rel = (f: string) => relative(root, f)

// ---------------------------------------------------------------------------
// D1 · the contract, declared once
// ---------------------------------------------------------------------------
console.log('\nD1 · the paper contract')

const css = readFileSync(join(root, 'app', 'globals.css'), 'utf8')

/** The `@layer components { … }` block, matched by brace depth rather than by
 *  a lazy `[\s\S]*?}` — the block contains nested rules. */
function layerBlock(name: string): string | null {
  const start = css.indexOf(`@layer ${name} {`)
  if (start < 0) return null
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(start, i + 1)
    }
  }
  return null
}

const components = layerBlock('components')
check('globals.css declares a @layer components block', components !== null)

const contract = components?.match(/\.print-container,\s*\.print-sheet\s*\{([\s\S]*?)\}/)
check(
  'the contract names both sheet classes',
  Boolean(contract),
  '`.print-container, .print-sheet` must be declared together in @layer components',
)
if (contract) {
  const body = contract[1]
  check('...and declares a ground', /background:\s*#[0-9a-fA-F]{3,8}/.test(body), body.trim())
  check('...and declares an ink', /(?:^|[\s;])color:\s*#[0-9a-fA-F]{3,8}/.test(body), body.trim())
  check(
    '...neither half reads a theme variable',
    !/var\(--/.test(body),
    'paper does not follow the theme — that is the whole point of the contract',
  )
}

/*
 * Utilities must still beat it. If the contract ever moves into
 * `@layer utilities` (or out of a layer entirely) then `/ranking`'s navy ink
 * and the paper-always screens' pure black stop applying, silently.
 */
const utilities = layerBlock('utilities')
check(
  'the contract is NOT in @layer utilities',
  !/\.print-container\s*,|\.print-sheet\s*\{/.test(utilities ?? ''),
  'a sheet overrides its ink with a utility class; utilities must win',
)

// ---------------------------------------------------------------------------
// D2/D3 · every sheet
// ---------------------------------------------------------------------------
console.log('\nD2 · every sheet carries the contract')

/** A fixed paper dimension. Millimetres and centimetres both appear in the
 *  existing sheets; either is a claim to be a piece of paper. */
const SHEET_SIZE = /\b(?:w|h|min-h|max-w)-\[\d+(?:\.\d+)?(?:mm|cm)\]/
const SHEET_CLASS = /\bprint-(?:container|sheet)\b/
const THEME_GROUND = /\bbg-(?:bg-surface|bg-app|paper)\b/
const OWN_GROUND = /\bbg-(?:white|\[#(?:fff|FFF|ffffff|FFFFFF)\])\b/
const OWN_INK = /\btext-(?:black|gray-[89]00|slate-[89]00|blue-900|\[#[0-9a-fA-F]{3,6}\])\b/

/** The class-attribute values on one line, so a rule reads one element at a
 *  time rather than everything that happens to share a source line. */
function classLists(line: string): string[] {
  const out: string[] = []
  for (const m of line.matchAll(/className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? '')
  }
  return out
}

const sheets: { file: string; line: number; cls: string }[] = []
for (const f of tsx) {
  code(readFileSync(f, 'utf8'))
    .split('\n')
    .forEach((line, i) => {
      for (const cls of classLists(line)) {
        /*
         * `.preview-scroll` is the horizontal-scroll container the sheet sits
         * *in* — `verify-page-frame.mts` R6 is what requires it — and it caps
         * its own width at the paper's so the sheet is not clipped. It is not
         * a sheet, and grounding it would paint a white gutter beside one.
         */
        if (/\bpreview-scroll\b/.test(cls)) continue
        if (SHEET_SIZE.test(cls) || SHEET_CLASS.test(cls)) {
          sheets.push({ file: rel(f), line: i + 1, cls })
        }
      }
    })
}

check(
  'the app still renders A4 sheets',
  sheets.length >= 10,
  `found ${sheets.length}; this harness is vacuous if the selector stops matching`,
)

const undeclared = sheets.filter(
  (s) => !SHEET_CLASS.test(s.cls) && !(OWN_GROUND.test(s.cls) && OWN_INK.test(s.cls)),
)
check(
  'every sheet carries a sheet class, or declares ground AND ink itself',
  undeclared.length === 0,
  undeclared.map((s) => `${s.file}:${s.line}  ${s.cls.slice(0, 90)}`).join('\n      '),
)

console.log('\nD3 · paper does not follow the theme')

const themed = sheets.filter((s) => THEME_GROUND.test(s.cls))
check(
  'no sheet grounds itself in a theme token',
  themed.length === 0,
  themed.map((s) => `${s.file}:${s.line}  ${s.cls.slice(0, 90)}`).join('\n      ') +
    '\n      a themed ground prints the theme: the element background survives ' +
    '@media print, and print-color-adjust is exact',
)

// ---------------------------------------------------------------------------
// D4 · the brand tint
// ---------------------------------------------------------------------------
console.log('\nD4 · the brand tint moves as a pair')

check(
  'globals.css defines --brand-soft / --brand-on-soft for both themes',
  (css.match(/--brand-soft:/g) ?? []).length >= 2 &&
    (css.match(/--brand-on-soft:/g) ?? []).length >= 2,
  'one definition means one theme is unstated and falls back to the other',
)

/*
 * The tint and its ink, wherever they are written.
 *
 * Three spellings, all of which occurred:
 *
 *   one class list   `bg-brand-100 text-brand` on the element
 *   a variant        `peer-checked:bg-brand-100 … text-brand`
 *   two properties   a palette row `{ color: 'bg-brand-100', text: 'text-brand' }`
 *
 * A token match on a single string literal catches only the first, so the
 * ground is matched with an optional variant prefix, and the pair is looked
 * for within a two-line window as well as within one string. The window is a
 * heuristic and is stated as one: it holds because the two halves of a colour
 * decision are written together, and it will not catch a tint declared in one
 * file and used in another.
 */
const TINT = /(?:^|[\s'"`])(?:[a-z-]+:)*bg-brand-100(?:\/\d+)?(?![\w-])/
const INK = /(?:^|[\s'"`])(?:[a-z-]+:)*text-brand(?![\w-])/

const drift: string[] = []
for (const f of tsx) {
  const src = code(readFileSync(f, 'utf8'))

  // One class list: `isActive ? 'bg-brand-100 text-brand' : '…'` is two lists
  // on one line, and only one of them is the pair.
  for (const m of src.matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
    const body = m[2]
    if (TINT.test(body) && INK.test(body) && !/dark:/.test(body)) {
      drift.push(`${rel(f)}  ${body.trim().slice(0, 80)}`)
    }
  }

  // ...and the two-line window.
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    const window = lines.slice(i, i + 2).join('\n')
    if (!TINT.test(line)) return
    if (!INK.test(window)) return
    if (/dark:/.test(window)) return
    const entry = `${rel(f)}:${i + 1}  ${line.trim().slice(0, 80)}`
    if (!drift.some((d) => d.startsWith(`${rel(f)}  `) && line.includes(d.split('  ')[1] ?? '\0'))) {
      drift.push(entry)
    }
  })
}
check(
  'no bg-brand-100 + text-brand without a dark override',
  drift.length === 0,
  drift.join('\n      ') +
    '\n      use bg-brand-soft / text-brand-on-soft: the ramp is fixed and --brand is not, ' +
    'so cyan on brand-100 measures 1.96:1 in dark mode',
)

// ---------------------------------------------------------------------------
// D5 · the retired brand literal
// ---------------------------------------------------------------------------
console.log('\nD5 · the retired brand blue')

/*
 * `#0054a6` was the brand before the ramp in globals.css replaced it, and it
 * survived in the documents — so `/parent-report` printed a letterhead in a
 * blue the product no longer has, and two charts drew a line in it that
 * measured 2.26:1 on a dark card. The paper navy is brand-800 (#1D3E73), which
 * is what `/print-student-codes` already prints.
 *
 * Comments are stripped first: `Button.tsx` names the literal while describing
 * the pattern it replaced, which is documentation and not a colour.
 */
const legacyBrand: string[] = []
for (const f of tsx.concat(walk(join(root, 'lib')).filter((x) => /\.tsx?$/.test(x)))) {
  const src = code(readFileSync(f, 'utf8'))
  if (/#0054a6|#4facfe/i.test(src)) legacyBrand.push(rel(f))
}
check(
  'the retired brand literal appears in no rendered code',
  legacyBrand.length === 0,
  legacyBrand.join('\n      '),
)

// ---------------------------------------------------------------------------
// D6 · the screen and the sheet agree about who placed
// ---------------------------------------------------------------------------
console.log('\nD6 · one rule for a placing')

/*
 * Test A, the last open item of the P0-1 family: generate a report and diff it
 * against the screen.
 *
 * Run live against a seeded class it found this. `/ranking`'s November table
 * matched the canonical figures exactly — 9.00 rank 1, a 7.00 tie sharing rank
 * 2, the next rank skipping to 4 — and then printed "៤" beside two pupils who
 * had no marks at all, where `ranking_monthly` built from the same figures
 * leaves the cell blank. `assignRanks` weighs a null average as 0 so that
 * unmarked pupils sort last; that ordering position is not a placing, and
 * `report-data.ts` said so five times while no screen said it once.
 *
 * `placing()` is that rule, beside the result it is a property of. These checks
 * are structural because the screens live in `.tsx` files a node harness cannot
 * import — the same reason `verify-annual.mts` §K is structural.
 */
const periodResults = readFileSync(join(root, 'lib', 'scores', 'periodResults.ts'), 'utf8')
check(
  'periodResults exports placing()',
  /export function placing\s*\(/.test(periodResults),
  'the rule must have exactly one home',
)
check(
  '...and it is the null-average rule, not a restatement of rank',
  /average === null \? null : r\.rank/.test(code(periodResults)),
)

const reportData = code(readFileSync(join(root, 'lib', 'reporting', 'report-data.ts'), 'utf8'))
const inlineRule = (reportData.match(/average === null \? '' : toKhmerNumber\(c\.rank\)/g) ?? []).length
check(
  'no resolver restates the rule inline',
  inlineRule === 0,
  `${inlineRule} site(s) still spell it out; call placing() instead`,
)
check(
  'the resolvers read placing()',
  (reportData.match(/placing\(/g) ?? []).length >= 5,
  'five report families print a rank; each must ask the same question',
)

const ranking = code(readFileSync(join(root, 'app', '(main)', 'ranking', 'RankingClient.tsx'), 'utf8'))
check(
  '/ranking reads placing() rather than the raw rank',
  /placing\(r\)/.test(ranking) && !/rank:\s*r\?\.rank \?\? 0/.test(ranking),
  'the screen must not print a placing the sheet would leave blank',
)

// ---------------------------------------------------------------------------
console.log(
  failures === 0
    ? `\n✓ ${sheets.length} sheets, one contract.\n`
    : `\n✗ ${failures} failure(s)\n`,
)
process.exit(failures === 0 ? 0 : 1)
