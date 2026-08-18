/**
 * The level-first onboarding's pure pieces, checked offline.
 *
 *     node scripts/verify-onboarding.mts
 *
 * What is checkable without a browser or a database:
 *
 *   1. The curriculum ladder — grade ranges per level (1–6 / 7–9 / 10–12),
 *      sort_order carrying the grade number (template context resolution and
 *      class creation both depend on that contract), and the canonical level
 *      names migration 00004 backfilled, which every cross-school report
 *      groups on and `resolveClassTemplateContext` matches against.
 *
 *   2. Level-key validation — the same `levelByKey` gate that
 *      `createOrganisation` and `chooseEducationLevel` apply to any value the
 *      client supplies, so a tampered sessionStorage hint can never name a
 *      level the ladder does not define.
 *
 * What is deliberately NOT here, because it cannot be: the OAuth round trip,
 * RLS on join_requests, and the callback routing — those need a live project.
 *
 * Exits non-zero on any failure.
 */

import {
  EDUCATION_LEVELS,
  gradesForLevel,
  levelByKey,
} from '../lib/onboarding/curriculum.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

// --- 1. the ladder -------------------------------------------------------------
console.log('\ngrade ranges per level:')
const EXPECTED: Record<string, { name: string; from: number; to: number }> = {
  primary: { name: 'បឋមសិក្សា', from: 1, to: 6 },
  lower_secondary: { name: 'មធ្យមសិក្សាបឋមភូមិ', from: 7, to: 9 },
  upper_secondary: { name: 'មធ្យមសិក្សាទុតិយភូមិ', from: 10, to: 12 },
}

check('exactly three levels', EDUCATION_LEVELS.length === 3)

for (const [key, expected] of Object.entries(EXPECTED)) {
  const level = levelByKey(key)
  if (!level) {
    check(`${key} exists`, false)
    continue
  }
  check(`${key}: canonical name matches 00004`, level.name === expected.name,
    `got ${level.name}`)

  const grades = gradesForLevel(level)
  const numbers = grades.map((g) => g.sortOrder)
  const wanted = Array.from(
    { length: expected.to - expected.from + 1 },
    (_, i) => expected.from + i,
  )
  check(`${key}: grades ${expected.from}–${expected.to}, sort_order = grade number`,
    JSON.stringify(numbers) === JSON.stringify(wanted), `got ${numbers.join(',')}`)
  check(`${key}: every grade named ថ្នាក់ទី…`,
    grades.every((g) => g.name.startsWith('ថ្នាក់ទី')))
}

// --- 2. the validation gate ------------------------------------------------------
console.log('\nlevel-key validation (the sessionStorage hint is only a hint):')
for (const good of ['primary', 'lower_secondary', 'upper_secondary']) {
  check(`accepts ${good}`, levelByKey(good) !== undefined)
}
for (const bad of ['', 'PRIMARY', 'grade-12', 'primary; DROP TABLE scores', '../../etc']) {
  check(`rejects ${JSON.stringify(bad)}`, levelByKey(bad) === undefined)
}

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ onboarding ladder and validation behave as specified.')
