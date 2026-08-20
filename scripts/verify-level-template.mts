/**
 * The level / grade / track dimension of the score template (migrations 00021
 * schema + 00026 curriculum).
 *
 *     node scripts/verify-level-template.mts
 *
 * Two families of claims:
 *
 *   1. The rows seeded by 00026 match the product owner's verified classroom
 *      table in docs/score-system-design.md §6 — per-grade/track subject
 *      sets, full marks, the eight checksums, subject absence (a grade that
 *      does not teach a subject has NO row for it), and different maxes for
 *      the same key across tracks (hs_khmer 75↔100, hs_math 100↔75).
 *
 *   2. Context selection is safe in every direction: any seeded grade/track
 *      resolves its own hs_* curriculum; a legacy account (no context), a
 *      primary class, and a grade 11–12 class with no track chosen all
 *      resolve the untouched primary list — never an empty picker.
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

// --- parse the 00026 seeds ----------------------------------------------------
const SQL = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/00026_secondary_classroom_curriculum.sql', import.meta.url)),
  'utf8',
)
// Track is NULL for grades 7–10 and quoted for 11–12.
const TUPLE =
  /\('system',\s*'([a-z_]+)',\s*(\d+),\s*(?:'([a-z_]+)'|NULL),\s*'([a-z_]+)',\s*'([^']*)',\s*NULL,\s*'([\s\S]*?)'::jsonb,\s*(\d+),\s*'([^']*)',\s*ARRAY\[([^\]]*)\]::TEXT\[\],\s*(\d+)\)/g

const seeds: ScoreTemplateSubjectRow[] = [...SQL.matchAll(TUPLE)].map((m, i) => ({
  id: `seed:${i}`,
  scope: 'system' as const,
  level_key: m[1] as ScoreTemplateSubjectRow['level_key'],
  grade_number: Number(m[2]),
  track: (m[3] ?? null) as ScoreTemplateSubjectRow['track'],
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

console.log(`\nparsed ${seeds.length} seeded rows from 00026`)
check('105 rows — the full grade 7–12 curriculum', seeds.length === 105)

// --- 1. the verified classroom table ---------------------------------------------
// The product owner's checksums, per grade/track combination.
const CHECKSUMS: [string, number, string | null, number, number][] = [
  // level              grade  track             subjects  total
  ['lower_secondary',  7, null,             13, 750],
  ['lower_secondary',  8, null,             14, 800],
  ['lower_secondary',  9, null,             14, 800],
  ['upper_secondary', 10, null,             14, 800],
  ['upper_secondary', 11, 'science',        12, 750],
  ['upper_secondary', 11, 'social_science', 13, 800],
  ['upper_secondary', 12, 'science',        12, 750],
  ['upper_secondary', 12, 'social_science', 13, 800],
]

console.log('\nchecksums per grade/track:')
for (const [level, grade, track, nSubjects, total] of CHECKSUMS) {
  const rows = seeds.filter(
    (r) => r.level_key === level && r.grade_number === grade && r.track === track,
  )
  const got = rows.reduce((a, r) => a + r.max_score, 0)
  check(`${level} ${grade}${track ? ` ${track}` : ''}: ${nSubjects} subjects, Σ${total}, coef ${total / 50}`,
    rows.length === nSubjects && got === total
      && rows.reduce((a, r) => a + r.max_score / 50, 0) === total / 50,
    `got ${rows.length} subjects, Σ${got}`)
  check('  …full marks land exactly on /50',
    coefficientAverage(rows.map((r) => ({ score: r.max_score, maxScore: r.max_score })), SECONDARY_SCHEME_CONFIG) === 50)
}

console.log('\nmembership and per-track marks:')
const at = (grade: number, track: string | null, key: string) =>
  seeds.find((r) => r.grade_number === grade && r.track === track && r.subject_key === key)
check('grade 7 has no chemistry row (absent, not zero, not hidden)',
  at(7, null, 'hs_chemistry') === undefined)
check('grade 7 has no economics row', at(7, null, 'hs_econ') === undefined)
check('grades 11–12 have no life-skills or arts rows',
  seeds.every((r) => r.grade_number! < 11 || (r.subject_key !== 'hs_lifeskill' && r.subject_key !== 'hs_arts')))
check('economics exists only in the social track of grades 11–12',
  seeds.filter((r) => r.subject_key === 'hs_econ')
    .every((r) => r.track === 'social_science' && r.grade_number! >= 11)
  && seeds.some((r) => r.subject_key === 'hs_econ'))
check('khmer flips 75↔100 across the grade-12 tracks',
  at(12, 'science', 'hs_khmer')?.max_score === 75 && at(12, 'social_science', 'hs_khmer')?.max_score === 100)
check('math flips 100↔75 across the grade-12 tracks',
  at(12, 'science', 'hs_math')?.max_score === 100 && at(12, 'social_science', 'hs_math')?.max_score === 75)
check('history flips 50↔75 across the grade-11 tracks',
  at(11, 'science', 'hs_history')?.max_score === 50 && at(11, 'social_science', 'hs_history')?.max_score === 75)
check('no BacII weighting anywhere (nothing at /125)',
  seeds.every((r) => r.max_score !== 125))
check('foreign language is an ordinary /50 subject at every grade (no /25, no minus-25)',
  seeds.filter((r) => r.subject_key === 'hs_foreign').length === 8
  && seeds.filter((r) => r.subject_key === 'hs_foreign').every((r) => r.max_score === 50))
check('column id is the subject key (what scores.subject stores)',
  seeds.every((r) => r.columns.length === 1 && r.columns[0].id === r.subject_key))
check('one key per subject across all grades — same key at 7 and 12',
  at(7, null, 'hs_math') !== undefined && at(12, 'science', 'hs_math') !== undefined)

// --- 2. context selection ---------------------------------------------------------
console.log('\ncontext selection:')
const all = [...SYSTEM_PRIMARY_TEMPLATE, ...seeds]
const primaryPicker = toSubjectOptions(resolveTemplate(SYSTEM_PRIMARY_TEMPLATE, 'monthly'))
const pick = (ctx?: TemplateContext) => toSubjectOptions(resolveTemplate(all, 'monthly', ctx))

check('no context → primary picker unchanged',
  JSON.stringify(pick(undefined)) === JSON.stringify(primaryPicker))
check('primary class → primary picker unchanged (falls back to untagged)',
  JSON.stringify(pick({ levelKey: 'primary', gradeNumber: 3, track: null })) === JSON.stringify(primaryPicker))
check('grade 8 → its real 14 subjects, not the fallback',
  pick({ levelKey: 'lower_secondary', gradeNumber: 8, track: null }).length === 14)
check('grade 10 → its real 14 subjects, not the fallback',
  pick({ levelKey: 'upper_secondary', gradeNumber: 10, track: null }).length === 14)
check('grade 12, track not chosen yet → falls back, never empty',
  JSON.stringify(pick({ levelKey: 'upper_secondary', gradeNumber: 12, track: null })) === JSON.stringify(primaryPicker))
check('grade 11, track not chosen yet → falls back, never empty',
  JSON.stringify(pick({ levelKey: 'upper_secondary', gradeNumber: 11, track: null })) === JSON.stringify(primaryPicker))

{
  const science = pick({ levelKey: 'upper_secondary', gradeNumber: 12, track: 'science' })
  check('grade-12 science → twelve hs_* subjects, no primary skill',
    science.length === 12 && science.every((o) => o.value.startsWith('hs_')),
    science.map((o) => o.value).join(','))
  const maxes = maxScoreByColumn(resolveTemplate(all, 'monthly', { levelKey: 'upper_secondary', gradeNumber: 12, track: 'science' }))
  check('science hs_math is /100 (classroom, not the BacII /125)', maxes['hs_math'] === 100)

  const social = maxScoreByColumn(resolveTemplate(all, 'monthly', { levelKey: 'upper_secondary', gradeNumber: 12, track: 'social_science' }))
  check('social hs_math is /75 and hs_khmer /100', social['hs_math'] === 75 && social['hs_khmer'] === 100)
}

// --- 3. class overrides on a tracked curriculum -------------------------------------
console.log('\nclass overrides under a track:')
{
  const ctx: TemplateContext = { levelKey: 'upper_secondary', gradeNumber: 12, track: 'science' }
  const base = seeds.find((r) => r.grade_number === 12 && r.track === 'science' && r.subject_key === 'hs_math')!
  const override: ScoreTemplateSubjectRow = {
    ...base, id: 'class:hs_math', scope: 'class', class_id: 'c-1',
    level_key: null, grade_number: null, track: null, hidden: true,
  }
  const rows = [...all, override]
  const picker = toSubjectOptions(resolveTemplate(rows, 'monthly', ctx))
  check('hiding hs_math removes it from the tracked picker',
    picker.length === 11 && !picker.some((o) => o.value === 'hs_math'))

  const editor = resolveTemplateEditor(rows, 'monthly', ctx)
  const entry = editor.find((s) => s.subjectKey === 'hs_math')
  check('editor inherits from the science row, not the social one',
    entry?.inherited?.max_score === 100 && entry?.override?.id === 'class:hs_math')
  check('a class row is never dropped by context filtering',
    filterRowsForContext(rows, ctx).some((r) => r.id === 'class:hs_math'))

  // A teacher's own max-score override must keep winning over the new seed —
  // the layered-resolution contract, now exercised against real data.
  const maxOverride: ScoreTemplateSubjectRow = {
    ...base, id: 'class:hs_math:max', scope: 'class', class_id: 'c-1',
    level_key: null, grade_number: null, track: null, max_score: 80,
  }
  const withMax = maxScoreByColumn(resolveTemplate([...all, maxOverride], 'monthly', ctx))
  check('a class max-score override still wins over the 00026 system row',
    withMax['hs_math'] === 80, `got ${withMax['hs_math']}`)
}

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ level dimension behaves as specified.')
