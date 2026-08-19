/**
 * The multi-level grading engine, checked against the design's verified tables.
 *
 *     node scripts/verify-grading.mts
 *
 * Three claims, all from docs/score-system-design.md:
 *
 *   1. §3.2 — coefficient is derived: maxScore ÷ 50, and the coefficient
 *      average of full marks lands exactly on /50 with no manual normalising.
 *   2. §3.3ក — band thresholds on other scales use `floor`, reproducing the
 *      kp-tralach.org tables digit for digit (125 → 112/100/87/75/62 …).
 *   3. Neutrality — the primary /10 path returns exactly what the original
 *      `if (avg >= 9) …` chain returned, for every quarter-mark 0 to 10.
 *
 * Exits non-zero on any failure.
 */

import {
  bandThreshold,
  coefficientAverage,
  coefficientOf,
  DEFAULT_SCHEME_CONFIG,
  gradeFor,
  parseSchemeConfig,
  SECONDARY_SCHEME_CONFIG,
} from '../lib/grading/scheme.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

// --- 1. coefficients ---------------------------------------------------------
console.log('\ncoefficients (§3.2):')
for (const [max, expected] of [[25, 0.5], [50, 1], [75, 1.5], [100, 2], [125, 2.5]] as const) {
  const got = coefficientOf(max, SECONDARY_SCHEME_CONFIG)
  check(`/${max} → ${expected}`, got === expected, `got ${got}`)
}
check('simple weighting → every subject weighs 1', coefficientOf(125, DEFAULT_SCHEME_CONFIG) === 1)

// --- 2. the coefficient average ----------------------------------------------
console.log('\ncoefficient average:')
{
  // Grade-12 science, full marks: Σ475 ÷ Σ9.5 must be exactly 50.
  const science = [125, 75, 75, 75, 75, 50].map((m) => ({ score: m, maxScore: m }))
  check('full marks land on /50', coefficientAverage(science, SECONDARY_SCHEME_CONFIG) === 50)

  // Unmarked subjects drop out with their coefficients — not counted as zero.
  const partial = [
    { score: 100, maxScore: 125 }, // coef 2.5
    { score: 60, maxScore: 75 },   // coef 1.5
    { score: null, maxScore: 75 }, // skipped
  ]
  check('nulls skipped', coefficientAverage(partial, SECONDARY_SCHEME_CONFIG) === 40, // 160 / 4
    `got ${coefficientAverage(partial, SECONDARY_SCHEME_CONFIG)}`)
  check('nothing marked → null', coefficientAverage([{ score: null, maxScore: 75 }], SECONDARY_SCHEME_CONFIG) === null)

  // Simple weighting degrades to the plain mean.
  const simple = [{ score: 8, maxScore: 10 }, { score: 6, maxScore: 10 }]
  check('simple weighting = plain mean', coefficientAverage(simple, DEFAULT_SCHEME_CONFIG) === 7)
}

// --- 2b. the worked mixed-denominator example (brief §31) ----------------------
console.log('\nmixed denominators:')
{
  // A /50 c1 scored 40, B /75 c1.5 scored 60, C /100 c2 scored 80.
  // Σscore ÷ Σcoefficient = 180 ÷ 4.5 = 40 — identical to the normalised form
  // Σ(score/max × coef) ÷ Σcoef × 50, since coef = max ÷ 50 makes
  // score/max × coef × 50 collapse to score.
  const entries = [
    { score: 40, maxScore: 50 },
    { score: 60, maxScore: 75 },
    { score: 80, maxScore: 100 },
  ]
  const got = coefficientAverage(entries, SECONDARY_SCHEME_CONFIG)
  check('40/50 + 60/75 + 80/100 → 40 (/50)', got === 40, `got ${got}`)
  check('…and it grades B', gradeFor(got, SECONDARY_SCHEME_CONFIG)?.letter === 'B')
}

// --- 2c. equivalent percentages, same letter -----------------------------------
console.log('\npercentage equivalence:')
{
  const cases: [number, number][] = [[9, 10], [45, 50], [90, 100]]
  const letters = cases.map(([avg, scale]) =>
    gradeFor(avg, SECONDARY_SCHEME_CONFIG, scale)?.letter)
  check('9/10 ≡ 45/50 ≡ 90/100 under one band set',
    letters.every((l) => l === 'A'), `got ${letters.join(',')}`)
}

// --- 3. floor thresholds (§3.3ក, verified tables) ------------------------------
console.log('\nfloor thresholds:')
const TABLE: Record<number, number[]> = {
  125: [112, 100, 87, 75, 62],
  75: [67, 60, 52, 45, 37],
  50: [45, 40, 35, 30, 25],
  10: [9, 8, 7, 6, 5],
}
for (const [scale, expected] of Object.entries(TABLE)) {
  const mins = SECONDARY_SCHEME_CONFIG.bands.slice(0, 5).map((b) => b.min)
  const got = mins.map((m) => bandThreshold(m, Number(scale), SECONDARY_SCHEME_CONFIG))
  check(`/${scale} → ${expected.join('/')}`,
    JSON.stringify(got) === JSON.stringify(expected), `got ${got.join('/')}`)
}

// --- 4. grade conversion (the brief's matrix) ----------------------------------
console.log('\ngrade conversion:')
const CASES: [number, number, string][] = [
  [9, 10, 'A'], [8, 10, 'B'], [7, 10, 'C'], [6, 10, 'D'], [5, 10, 'E'], [4, 10, 'F'],
  [45, 50, 'A'], [40, 50, 'B'], [35, 50, 'C'],
  [30, 50, 'D'], [25, 50, 'E'], [24, 50, 'F'],
  [112, 125, 'A'], [111, 125, 'B'], [67, 75, 'A'], [37, 75, 'E'],
]
for (const [avg, scale, letter] of CASES) {
  const cfg = scale === 10 ? DEFAULT_SCHEME_CONFIG : SECONDARY_SCHEME_CONFIG
  const got = gradeFor(avg, cfg, scale)?.letter
  check(`${avg}/${scale} = ${letter}`, got === letter, `got ${got}`)
}
check('secondary A descriptor is ល្អប្រសើរ',
  gradeFor(45, SECONDARY_SCHEME_CONFIG)?.label === 'ល្អប្រសើរ')
check('primary A descriptor unchanged (ល្អណាស់)',
  gradeFor(9, DEFAULT_SCHEME_CONFIG)?.label === 'ល្អណាស់')
check('pass mark converts with the scale (25/50 passes)',
  gradeFor(25, SECONDARY_SCHEME_CONFIG)?.passed === true &&
  gradeFor(24, SECONDARY_SCHEME_CONFIG)?.passed === false)

// --- 5. primary neutrality ------------------------------------------------------
console.log('\nprimary /10 neutrality:')
{
  // The original chain, verbatim.
  const legacy = (avg: number) =>
    avg >= 9 ? 'A' : avg >= 8 ? 'B' : avg >= 7 ? 'C' : avg >= 6 ? 'D' : avg >= 5 ? 'E' : 'F'
  let diverged = 0
  for (let q = 0; q <= 40; q++) {
    const avg = q / 4
    if (gradeFor(avg)?.letter !== legacy(avg)) diverged++
  }
  check('every quarter-mark 0–10 grades identically', diverged === 0, `${diverged} diverged`)

  // A DB scheme with a fractional custom band must keep its exact min on its
  // own scale — flooring only applies when converting to another scale.
  const custom = parseSchemeConfig({
    maxScore: 10, passMark: 5,
    bands: [
      { letter: 'A', min: 8.5, max: 10, label: 'x' },
      { letter: 'F', min: 0, max: 8.49, label: 'y' },
    ],
  })
  check('fractional band min honoured on own scale',
    gradeFor(8.5, custom)?.letter === 'A' && gradeFor(8.4, custom)?.letter === 'F')
  check('parseSchemeConfig defaults weighting to simple', custom.weighting === 'simple')
}

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ grading engine matches the verified tables.')
