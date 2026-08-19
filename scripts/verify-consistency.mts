/**
 * One student, one result — across every surface (Prompt 4A §29).
 *
 *     node scripts/verify-consistency.mts
 *
 * After the migration, ranking, certificate, honor-roll, parent-report and
 * student-tracking all compute through lib/scores/aggregate.ts — the same
 * studentAverage / gradeFor path /score/total's engine uses. This harness
 * runs that ACTUAL shared code the way each surface calls it (its key source,
 * its score shape) over synthetic pupils in four contexts, and asserts the
 * averages, letters, descriptors and pass states agree.
 *
 * It also locks the shared fallback denominators against the totals grid's
 * own column config: if either list ever drifts, primary consistency breaks
 * silently, so the lock fails loudly here instead.
 *
 * Exits non-zero on any failure.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  FALLBACK_NUMERIC_KEYS,
  assignRanks,
  numericColumnKeys,
  studentAverage,
} from '../lib/scores/aggregate.ts'
import {
  maxScoreByColumn,
  resolveTemplate,
  SYSTEM_PRIMARY_TEMPLATE,
  type TemplateContext,
} from '../lib/scores/template.ts'
import { gradeFor, DEFAULT_SCHEME_CONFIG } from '../lib/grading/scheme.ts'
import { schemeForLevel } from '../lib/grading/levelSchemes.ts'
import { groupsFor, flatten } from '../app/(main)/score/total/scoreTotalConfig.ts'
import type { ScoreTemplateSubjectRow } from '../lib/types.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

// --- the denominator lock ------------------------------------------------------
console.log('\nfallback denominators vs the totals grid:')
for (const mode of ['monthly', 'semester'] as const) {
  const totalsKeys = flatten(groupsFor(mode, []))
    .filter((c) => !c.isText && !c.readOnly)
    .map((c) => c.key)
  check(`${mode}: shared list ≡ totals grid numeric columns (${totalsKeys.length})`,
    JSON.stringify([...FALLBACK_NUMERIC_KEYS[mode]].sort()) === JSON.stringify([...totalsKeys].sort()),
    `shared ${FALLBACK_NUMERIC_KEYS[mode].length} vs totals ${totalsKeys.length}`)
}

// --- grade-12 seeds, parsed from 00021 ------------------------------------------
const SQL = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/00021_score_template_levels.sql', import.meta.url)),
  'utf8',
)
const TUPLE =
  /\('system',\s*'([a-z_]+)',\s*(\d+),\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'([^']*)',\s*NULL,\s*'([\s\S]*?)'::jsonb,\s*(\d+),\s*'([^']*)',\s*ARRAY\[([^\]]*)\]::TEXT\[\],\s*(\d+)\)/g
const seeds: ScoreTemplateSubjectRow[] = [...SQL.matchAll(TUPLE)].map((m, i) => ({
  id: `seed:${i}`, scope: 'system' as const,
  level_key: m[1] as ScoreTemplateSubjectRow['level_key'],
  grade_number: Number(m[2]), track: m[3] as ScoreTemplateSubjectRow['track'],
  subject_key: m[4], label_km: m[5], group_label: null,
  columns: JSON.parse(m[6]), max_score: Number(m[7]),
  value_kind: m[8] as 'numeric' | 'text',
  score_types: m[9].split(',').map((v) => v.trim().replace(/^'|'$/g, '')),
  sort_order: Number(m[10]), hidden: false,
}))
const allRows = [...SYSTEM_PRIMARY_TEMPLATE, ...seeds]

/**
 * Every surface's calculation path, as it exists after the migration. Each
 * entry mirrors how that surface gathers its keys; the arithmetic underneath
 * is the one shared function.
 */
function surfaceResults(
  scores: Record<string, number | null>,
  context: TemplateContext | null,
) {
  const scheme = context?.levelKey ? schemeForLevel(context.levelKey) : DEFAULT_SCHEME_CONFIG
  const subjects = resolveTemplate(allRows, 'monthly', context)
  const maxByColumn = maxScoreByColumn(subjects)
  const level = context?.levelKey != null

  const templateKeys = numericColumnKeys(subjects)
  const rowKeys = Object.keys(scores).filter((k) => scores[k] !== null)

  const paths: Record<string, readonly string[]> = {
    scoreTotal: level ? templateKeys : FALLBACK_NUMERIC_KEYS.monthly,
    ranking: level ? templateKeys : FALLBACK_NUMERIC_KEYS.monthly,
    certificate: level ? templateKeys : FALLBACK_NUMERIC_KEYS.monthly,
    honorRoll: level ? templateKeys : FALLBACK_NUMERIC_KEYS.monthly,
    parentReport: level ? templateKeys : FALLBACK_NUMERIC_KEYS.monthly,
    // Tracking is row-driven by design; identical because every row belongs
    // to the curriculum and carries the same per-column weight.
    studentTracking: rowKeys,
  }

  return Object.fromEntries(
    Object.entries(paths).map(([name, keys]) => {
      const { average } = studentAverage(scores, keys, maxByColumn, scheme)
      const grade = gradeFor(average, scheme)
      return [name, { average, letter: grade?.letter ?? '-', label: grade?.label ?? '-', passed: grade?.passed ?? false }]
    }),
  )
}

function assertConsistent(
  title: string,
  scores: Record<string, number | null>,
  context: TemplateContext | null,
  expected: { average: number | null; letter: string; label?: string },
) {
  console.log(`\n${title}:`)
  const results = surfaceResults(scores, context)
  const names = Object.keys(results)
  const first = results[names[0]]

  check(`average ${expected.average} everywhere`,
    names.every((n) => results[n].average === expected.average),
    names.map((n) => `${n}=${results[n].average}`).join(' '))
  check(`letter ${expected.letter} everywhere`,
    names.every((n) => results[n].letter === expected.letter),
    names.map((n) => `${n}=${results[n].letter}`).join(' '))
  check('descriptor identical everywhere',
    names.every((n) => results[n].label === first.label))
  if (expected.label) check(`descriptor is ${expected.label}`, first.label === expected.label)
  check('pass state identical everywhere',
    names.every((n) => results[n].passed === first.passed))
}

// --- 1. primary, partial data ---------------------------------------------------
assertConsistent(
  'primary — partial data (three marks, rest unmarked)',
  { kh_read: 9, math_num: 8, ex_hw: 7, kh_listen: null },
  null,
  { average: 8, letter: 'B', label: 'ល្អ' },
)

// --- 2. grade-12 science, partial data ------------------------------------------
// 100/125 + 60/75 + 60/75 + 60/75 + 40/50, biology missing:
// Σscore 320 ÷ Σcoef (2.5+1.5+1.5+1.5+1) = 320/8 = 40 → B, ល្អណាស់.
assertConsistent(
  'grade-12 science — partial data (biology missing)',
  { hs_math: 100, hs_physics: 60, hs_chemistry: 60, hs_khmer: 60, hs_history: 40, hs_biology: null },
  { levelKey: 'upper_secondary', gradeNumber: 12, track: 'science' },
  { average: 40, letter: 'B', label: 'ល្អណាស់' },
)

// --- 3. grade-12 social science, full marks --------------------------------------
assertConsistent(
  'grade-12 social science — full marks',
  { hs_khmer: 125, hs_math: 75, hs_history: 75, hs_geography: 75, hs_moral_civics: 75, hs_earth: 50 },
  { levelKey: 'upper_secondary', gradeNumber: 12, track: 'social_science' },
  { average: 50, letter: 'A', label: 'ល្អប្រសើរ' },
)

// --- 4. missing ≠ zero ------------------------------------------------------------
assertConsistent(
  'grade-12 science — one subject marked, none dragged to zero',
  { hs_history: 25, hs_math: null, hs_physics: null, hs_chemistry: null, hs_biology: null, hs_khmer: null },
  { levelKey: 'upper_secondary', gradeNumber: 12, track: 'science' },
  { average: 25, letter: 'E', label: 'មធ្យម' },
)

// --- 5. ranks: shared walk, ties share ---------------------------------------------
console.log('\nrank walk:')
{
  const items = [
    { id: 'a', avg: 8.5, rank: 0 },
    { id: 'b', avg: 9.0, rank: 0 },
    { id: 'c', avg: 8.5, rank: 0 },
    { id: 'd', avg: 7.0, rank: 0 },
  ]
  assignRanks(items, (i) => i.avg, (i, r) => { i.rank = r })
  const byId = Object.fromEntries(items.map((i) => [i.id, i.rank]))
  check('ties share a rank and the next rank skips',
    byId.b === 1 && byId.a === 2 && byId.c === 2 && byId.d === 4,
    JSON.stringify(byId))
}

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ one student, one result — across every surface.')
