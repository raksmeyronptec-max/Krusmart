/**
 * The level / grade / track dimension of the score template (migration 00021).
 *
 *     node scripts/verify-level-template.mts
 *
 * Two families of claims:
 *
 *   1. The grade-12 seeds transcribed into 00021 match the verified tables in
 *      docs/score-system-design.md §6 — per-track subject sets, full marks,
 *      Σ475 marks and Σ9.5 coefficient, and different maxes for the same key
 *      across tracks (hs_math 125↔75, hs_khmer 75↔125).
 *
 *   2. Context selection is safe in every direction: a grade-12 class with a
 *      track resolves the hs_* curriculum; a legacy account (no context), a
 *      primary class, an unseeded level, and a grade-12 class with no track
 *      chosen all resolve the untouched primary list — never an empty picker.
 *
 * Exits non-zero on any failure.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  filterRowsForContext,
  maxScoreByColumn,
  resolveTemplate,
  resolveTemplateEditor,
  SYSTEM_PRIMARY_TEMPLATE,
  toSubjectOptions,
  type TemplateContext,
} from '../lib/scores/template.ts'
import { coefficientAverage, SECONDARY_SCHEME_CONFIG } from '../lib/grading/scheme.ts'
import type { ScoreTemplateSubjectRow } from '../lib/types.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

// --- parse the 00021 seeds ----------------------------------------------------
const SQL = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/00021_score_template_levels.sql', import.meta.url)),
  'utf8',
)
const TUPLE =
  /\('system',\s*'([a-z_]+)',\s*(\d+),\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'([^']*)',\s*NULL,\s*'([\s\S]*?)'::jsonb,\s*(\d+),\s*'([^']*)',\s*ARRAY\[([^\]]*)\]::TEXT\[\],\s*(\d+)\)/g

const seeds: ScoreTemplateSubjectRow[] = [...SQL.matchAll(TUPLE)].map((m, i) => ({
  id: `seed:${i}`,
  scope: 'system' as const,
  level_key: m[1] as ScoreTemplateSubjectRow['level_key'],
  grade_number: Number(m[2]),
  track: m[3] as ScoreTemplateSubjectRow['track'],
  subject_key: m[4],
  label_km: m[5],
  group_label: null,
  columns: JSON.parse(m[6]),
  max_score: Number(m[7]),
  value_kind: m[8] as 'numeric' | 'text',
  score_types: m[9].split(',').map((v) => v.trim().replace(/^'|'$/g, '')),
  sort_order: Number(m[10]),
  hidden: false,
}))

console.log(`\nparsed ${seeds.length} seeded rows from 00021`)
check('twelve rows — six per track', seeds.length === 12)

// --- 1. the verified tables -----------------------------------------------------
const DOC: Record<string, [string, number][]> = {
  science: [
    ['hs_math', 125], ['hs_physics', 75], ['hs_chemistry', 75],
    ['hs_biology', 75], ['hs_khmer', 75], ['hs_history', 50],
  ],
  social_science: [
    ['hs_khmer', 125], ['hs_math', 75], ['hs_history', 75],
    ['hs_geography', 75], ['hs_moral_civics', 75], ['hs_earth', 50],
  ],
}

for (const [track, expected] of Object.entries(DOC)) {
  console.log(`\n${track}:`)
  const rows = seeds
    .filter((r) => r.track === track)
    .sort((a, b) => a.sort_order - b.sort_order)
  check('order and keys match the doc',
    JSON.stringify(rows.map((r) => r.subject_key)) === JSON.stringify(expected.map((e) => e[0])),
    `got ${rows.map((r) => r.subject_key).join(',')}`)
  check('full marks match the doc',
    JSON.stringify(rows.map((r) => r.max_score)) === JSON.stringify(expected.map((e) => e[1])),
    `got ${rows.map((r) => r.max_score).join(',')}`)
  check('Σ marks = 475', rows.reduce((a, r) => a + r.max_score, 0) === 475)
  check('Σ coefficient = 9.5', rows.reduce((a, r) => a + r.max_score / 50, 0) === 9.5)
  check('column id is the subject key (what scores.subject stores)',
    rows.every((r) => r.columns.length === 1 && r.columns[0].id === r.subject_key))
  check('full marks land on /50',
    coefficientAverage(rows.map((r) => ({ score: r.max_score, maxScore: r.max_score })), SECONDARY_SCHEME_CONFIG) === 50)
}

// --- 2. context selection ---------------------------------------------------------
console.log('\ncontext selection:')
const all = [...SYSTEM_PRIMARY_TEMPLATE, ...seeds]
const primaryPicker = toSubjectOptions(resolveTemplate(SYSTEM_PRIMARY_TEMPLATE, 'monthly'))
const pick = (ctx?: TemplateContext) => toSubjectOptions(resolveTemplate(all, 'monthly', ctx))

check('no context → primary picker unchanged',
  JSON.stringify(pick(undefined)) === JSON.stringify(primaryPicker))
check('primary class → primary picker unchanged (falls back to untagged)',
  JSON.stringify(pick({ levelKey: 'primary', gradeNumber: 3, track: null })) === JSON.stringify(primaryPicker))
check('unseeded level (lower secondary) → falls back, never empty',
  JSON.stringify(pick({ levelKey: 'lower_secondary', gradeNumber: 8, track: null })) === JSON.stringify(primaryPicker))
check('grade 12, track not chosen yet → falls back, never empty',
  JSON.stringify(pick({ levelKey: 'upper_secondary', gradeNumber: 12, track: null })) === JSON.stringify(primaryPicker))
check('grade 10 (unseeded) → falls back, never empty',
  JSON.stringify(pick({ levelKey: 'upper_secondary', gradeNumber: 10, track: null })) === JSON.stringify(primaryPicker))

{
  const science = pick({ levelKey: 'upper_secondary', gradeNumber: 12, track: 'science' })
  check('grade-12 science → six hs_* subjects, no primary skill',
    science.length === 6 && science.every((o) => o.value.startsWith('hs_')),
    science.map((o) => o.value).join(','))
  const maxes = maxScoreByColumn(resolveTemplate(all, 'monthly', { levelKey: 'upper_secondary', gradeNumber: 12, track: 'science' }))
  check('science hs_math is /125', maxes['hs_math'] === 125)

  const social = maxScoreByColumn(resolveTemplate(all, 'monthly', { levelKey: 'upper_secondary', gradeNumber: 12, track: 'social_science' }))
  check('social hs_math is /75 and hs_khmer /125', social['hs_math'] === 75 && social['hs_khmer'] === 125)
}

// --- 3. class overrides on a tracked curriculum -------------------------------------
console.log('\nclass overrides under a track:')
{
  const ctx: TemplateContext = { levelKey: 'upper_secondary', gradeNumber: 12, track: 'science' }
  const base = seeds.find((r) => r.track === 'science' && r.subject_key === 'hs_math')!
  const override: ScoreTemplateSubjectRow = {
    ...base, id: 'class:hs_math', scope: 'class', class_id: 'c-1',
    level_key: null, grade_number: null, track: null, hidden: true,
  }
  const rows = [...all, override]
  const picker = toSubjectOptions(resolveTemplate(rows, 'monthly', ctx))
  check('hiding hs_math removes it from the tracked picker',
    picker.length === 5 && !picker.some((o) => o.value === 'hs_math'))

  const editor = resolveTemplateEditor(rows, 'monthly', ctx)
  const entry = editor.find((s) => s.subjectKey === 'hs_math')
  check('editor inherits from the science row, not the social one',
    entry?.inherited?.max_score === 125 && entry?.override?.id === 'class:hs_math')
  check('a class row is never dropped by context filtering',
    filterRowsForContext(rows, ctx).some((r) => r.id === 'class:hs_math'))
}

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ level dimension behaves as specified.')
