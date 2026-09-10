/**
 * The shared patterns stay shared, and the ink stays legible.
 *
 *     node scripts/verify-design-system.mts
 *
 * ── What this exists to stop ──────────────────────────────────────────────
 *
 * The brief's last phase asks for one implementation of each shared pattern —
 * page frame, context bar, tabs, buttons, dialogs, empty states, badges. Most
 * of them already have one and are covered: `verify-page-frame.mts` holds the
 * frame, `verify-documents.mts` holds the paper, `verify-navigation.mts` holds
 * the IA. What was left were two defects a style guide cannot catch, because
 * both are arithmetic:
 *
 *   · **the ink did not flip with the fill.** `--brand` is theme-aware and
 *     flips to cyan on dark; `text-white` is not. Sixteen elements wrote white
 *     on a brand fill, which measures **2.13:1** at night. `--brand-contrast`
 *     exists for exactly this and flips to navy.
 *   · **warning-as-a-label was never legible.** `--warning` is tuned as a fill
 *     and a 10% tint; used as text it measures **2.39:1** on the app ground and
 *     2.32:1 on its own tint, on 68 elements. `--warning-text` is the same
 *     treatment `--danger-text` already had.
 *
 * Both were measured in a real browser before being fixed, and the ratios below
 * are computed here from the tokens themselves rather than trusted.
 *
 * ── The rules ─────────────────────────────────────────────────────────────
 *
 *   S1  the label tokens exist, in both themes, and actually clear 4.5:1
 *   S2  no element writes `text-white` on a brand fill
 *   S3  no element uses `text-warning` as a label
 *   S4  a `role="tablist"` contains `role="tab"` with `aria-selected`
 *   S5  one implementation per surface — no second copy of a shared screen
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

const code = (s: string) =>
  s
    .replace(/(^|[\s{;,()=>])\/\*[\s\S]*?\*\//g, '$1')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const tsx = [...walk(join(root, 'app')), ...walk(join(root, 'components'))]
  .filter((f) => f.endsWith('.tsx'))
const rel = (f: string) => relative(root, f)

const css = readFileSync(join(root, 'app', 'globals.css'), 'utf8')

/** WCAG relative luminance and contrast, so the ratios are computed not claimed. */
function lum(hex: string): number {
  const n = hex.replace('#', '')
  const c = [0, 2, 4]
    .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
/** `fg` at `alpha` over `bg` — how a 10% tint actually renders. */
function over(fg: string, bg: string, alpha: number): string {
  const p = (h: string) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16))
  const [F, B] = [p(fg), p(bg)]
  return '#' + F.map((v, i) => Math.round(v * alpha + B[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')
}
/** Every declaration of a custom property, in source order: light then dark. */
function values(name: string): string[] {
  return [...css.matchAll(new RegExp(`^\\s*${name}:\\s*(#[0-9a-fA-F]{6});`, 'gm'))].map((m) => m[1])
}

// ---------------------------------------------------------------------------
console.log('\nS1 · the label tokens')

for (const token of ['--danger-text', '--warning-text']) {
  const declared = values(token)
  check(`${token} is declared for both themes`, declared.length === 2, declared.join(', '))
}

const [warnLight] = values('--warning-text')
const [appLight] = values('--background')
const [surfaceLight] = values('--surface')
const [warningFill] = values('--color-warning')

if (warnLight && appLight && surfaceLight) {
  const onApp = ratio(warnLight, appLight)
  const onCard = ratio(warnLight, surfaceLight)
  check('the warning label clears 4.5:1 on the app ground',
    onApp >= 4.5, `${onApp.toFixed(2)}:1`)
  check('...and on a card', onCard >= 4.5, `${onCard.toFixed(2)}:1`)
  if (warningFill) {
    // The badge case: the same label sitting on its own 10% tint.
    const onTint = ratio(warnLight, over(warningFill, surfaceLight, 0.1))
    check('...and on its own 10% tint', onTint >= 4.5, `${onTint.toFixed(2)}:1`)
    check('the fill itself is unchanged — only the label moved',
      warningFill.toLowerCase() === '#d99614', warningFill)
  }
}

// ---------------------------------------------------------------------------
console.log('\nS2 · the ink flips with the fill')

/** A class list holding a brand FILL (`bg-brand`, not `bg-brand-100`). */
const BRAND_FILL = /(^|[\s])(?:[a-z-]+:)*bg-brand(?![\w-])/
const WHITE_INK = /(^|[\s])(?:[a-z-]+:)*text-white(?![\w-])/

const whiteOnBrand: string[] = []
for (const f of tsx) {
  for (const m of code(readFileSync(f, 'utf8')).matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
    const body = m[2]
    if (BRAND_FILL.test(body) && WHITE_INK.test(body)) {
      whiteOnBrand.push(`${rel(f)}  ${body.trim().slice(0, 70)}`)
    }
  }
}
check(
  'nothing writes text-white on a brand fill',
  whiteOnBrand.length === 0,
  whiteOnBrand.join('\n      ') +
    '\n      use text-brand-contrast: --brand flips to cyan on dark and white measures 2.13:1 on it',
)

check(
  '--brand-contrast is what flips',
  values('--brand-contrast').length === 2,
  'one declaration means one theme is unstated',
)

// ---------------------------------------------------------------------------
console.log('\nS3 · warning as a label')

const bareWarning: string[] = []
for (const f of tsx) {
  const hits = (code(readFileSync(f, 'utf8')).match(/(^|[\s'"`{])(?:[a-z-]+:)*text-warning(?![\w-])/g) ?? []).length
  if (hits) bareWarning.push(`${rel(f)} (${hits})`)
}
check(
  'no element uses text-warning as a label',
  bareWarning.length === 0,
  bareWarning.join('\n      ') + '\n      use text-warning-text — 2.39:1 vs 4.91:1',
)

// ---------------------------------------------------------------------------
console.log('\nS4 · a tab list contains tabs')

/*
 * Eleven screens hand-roll a tab strip and ten of them were already correct —
 * `role="tab"` on each child and `aria-selected` bound to state. Converging
 * them into one component would be churn; making the eleventh a real tab list
 * was the actual defect. `/login`'s strip announced a tab list containing no
 * tabs, and exposed no selection at all.
 */
const tablists: string[] = []
for (const f of tsx) {
  const src = code(readFileSync(f, 'utf8'))
  if (!/role="tablist"/.test(src)) continue
  const hasTabs = /role="tab"/.test(src)
  const hasSelected = /aria-selected/.test(src)
  if (!hasTabs || !hasSelected) tablists.push(`${rel(f)} (tab:${hasTabs} selected:${hasSelected})`)
}
check('every tablist has role="tab" children with aria-selected',
  tablists.length === 0, tablists.join('\n      '))

// ---------------------------------------------------------------------------
console.log('\nS5 · one implementation per surface')

/*
 * `app/login/LoginForm.tsx` was a second 394-line copy of the sign-in form.
 * All five login routes import the one in `_components/`; the top-level copy
 * was imported by nothing and had diverged by 133 lines, so every sweep in
 * this program — including two in Phase 7 — edited both and reported double
 * the drift. It is deleted; this keeps it from coming back.
 */
const loginForms = tsx.filter((f) => /login\/(?:_components\/)?LoginForm\.tsx$/.test(rel(f)))
const importers = tsx
  .filter((f) => /from ['"][^'"]*LoginForm['"]/.test(readFileSync(f, 'utf8')))
  .map((f) => readFileSync(f, 'utf8').match(/from ['"]([^'"]*LoginForm)['"]/)?.[1] ?? '')
const orphan = loginForms.filter((f) => !importers.some((i) => i.includes('_components') === rel(f).includes('_components')))

check(
  'the sign-in form has one implementation',
  loginForms.length === 1,
  `${loginForms.length} copies: ${loginForms.map(rel).join(', ')}\n` +
    `      every login route imports _components/LoginForm; a second copy is dead on arrival.`,
)
check('...and every login route imports the same one',
  importers.length > 0 && importers.every((i) => i.includes('_components')),
  importers.join(', '))
void orphan

// ---------------------------------------------------------------------------
console.log(
  failures === 0
    ? '\n✓ shared patterns are shared, and the ink is legible in both themes.\n'
    : `\n✗ ${failures} failure(s)\n`,
)
process.exit(failures === 0 ? 0 : 1)
