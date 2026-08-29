/**
 * The acceptance test for the /score/total redesign.
 *
 *     node scripts/verify-score-total.mts
 *
 * Two claims carry the whole change and both are arithmetic, so both are
 * testable without a browser:
 *
 *   1. Switching a primary class from the hand-built twenty-nine column layout
 *      to the template-driven one loses no column. If it did, marks would
 *      silently stop counting toward an average that used to include them.
 *
 *   2. Narrowing the table to the class's template does not move a number that
 *      a teacher has already seen — because `computeRows` skips empty cells, so
 *      dropping columns nobody marked changes nothing.
 *
 * Scenario numbering follows the prompt's §27 validation cases.
 */

import { readFileSync } from 'node:fs'
import {
  flatten, groupsFor, groupsFromTemplate,
  type ColumnGroup, type TotalledStudent,
} from '../app/(main)/score/total/scoreTotalConfig.ts'
import { resolveTemplate } from '../lib/scores/template.ts'
import { applySelection, type ClassSubjectSelection } from '../lib/scores/selection.ts'
import {
  attentionList, sortRows, subjectPerformance, topPerformer,
} from '../lib/scores/totals.ts'
import { DEFAULT_SCHEME_CONFIG } from '../lib/grading/scheme.ts'
import type { ScoreTemplateSubjectRow } from '../lib/types.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures += 1; console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) }
}

// ---------------------------------------------------------------------------
// The 00028 grade-1 primary seed, read back out of the migration so this test
// cannot drift from what the database actually holds.
// ---------------------------------------------------------------------------
const sql = readFileSync('supabase/migrations/00028_primary_curriculum_and_class_selection.sql', 'utf8')
const ROW_RE = /\('system', 'primary', 1, '([^']+)', '((?:[^']|'')*)', '((?:[^']|'')*)',\s*'(\[[\s\S]*?\])'::jsonb,\s*10, '(numeric|text)', ARRAY\['(monthly|semester)'\]::TEXT\[\], (\d+)\)/g

const seed: ScoreTemplateSubjectRow[] = []
for (let m = ROW_RE.exec(sql); m; m = ROW_RE.exec(sql)) {
  seed.push({
    id: `seed:${m[1]}:${m[6]}`, scope: 'system', level_key: 'primary', grade_number: 1,
    subject_key: m[1], label_km: m[2].replace(/''/g, "'"), group_label: m[3].replace(/''/g, "'"),
    columns: JSON.parse(m[4]), max_score: 10, value_kind: m[5] as 'numeric' | 'text',
    score_types: [m[6]], sort_order: Number(m[7]), hidden: false,
  })
}

const CONTEXT = { levelKey: 'primary' as const, gradeNumber: 1 }
const sel = (k: string): ClassSubjectSelection => ({ subjectKey: k, enabledColumns: null, sortOrder: 0 })

/** The groups a class resolves, exactly as ScoreTotalClient builds them. */
function groupsForClass(mode: 'monthly' | 'semester', selection: ClassSubjectSelection[]): ColumnGroup[] {
  const subjects = applySelection(resolveTemplate(seed, mode, CONTEXT), selection)
  return groupsFromTemplate(subjects)
}

/** `computeRows`' averaging rule, in isolation: skip empty, mean the rest. */
function averageOver(columns: { key: string; isText?: boolean }[], scores: Record<string, number | string | null>): number {
  const marks: number[] = []
  for (const c of columns) {
    if (c.isText) continue
    const raw = scores[c.key]
    if (raw === null || raw === undefined || raw === '') continue
    const v = Number(raw)
    if (Number.isFinite(v)) marks.push(v)
  }
  return marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : 0
}

function student(id: string, name: string, scores: Record<string, number | string | null>): TotalledStudent {
  return {
    id, name_kh: name, scores,
    total: 0, average: '0.00', finalAverageForRank: 0, rank: 0,
    annualTotal: 0, annualAverage: '0.00', examTotal: 0, examAverage: '0.00',
    monthlyAverage: '0.00', semesterAverage: '0.00',
  } as unknown as TotalledStudent
}

console.log(`\nseed: ${seed.length} grade-1 rows parsed from 00028`)
check('the migration parsed', seed.length === 52, `got ${seed.length}, expected 52`)

// ---------------------------------------------------------------------------
console.log('\nColumn parity — the hand-built layout vs the template')
{
  for (const mode of ['monthly', 'semester'] as const) {
    const handBuilt = new Set(flatten(groupsFor(mode)).map(c => c.key))
    const templated = new Set(flatten(groupsForClass(mode, [])).map(c => c.key))
    const lost = [...handBuilt].filter(k => !templated.has(k))
    check(`${mode}: no column is lost by switching to the template`,
      lost.length === 0, `lost: ${lost.join(', ')}`)
    check(`${mode}: the sets are identical`,
      handBuilt.size === templated.size && lost.length === 0,
      `hand-built ${handBuilt.size}, template ${templated.size}`)
  }
}

// ---------------------------------------------------------------------------
console.log('\nCase 1 — a class teaching Khmer + Maths + Science')
{
  const groups = groupsForClass('monthly', [sel('khmer_all'), sel('math_general'), sel('science_all')])
  const names = groups.map(g => g.name)
  check('only those three subject bands appear',
    JSON.stringify(names) === JSON.stringify(['ភាសាខ្មែរ', 'គណិតវិទ្យា', 'វិទ្យាសាស្ត្រ']),
    `got ${JSON.stringify(names)}`)
  check('សិក្សាសង្គម is absent', !names.includes('សិក្សាសង្គម'))
  check('ការបំពេញបន្ថែម is absent', !names.includes('ការបំពេញបន្ថែម'))
  check('the columns are the three subjects\' own', flatten(groups).length === 7 + 5 + 5)
}

// ---------------------------------------------------------------------------
console.log('\nCase 2 — the teacher adds Social Studies')
{
  const before = groupsForClass('monthly', [sel('khmer_all'), sel('math_general')]).map(g => g.name)
  const after = groupsForClass('monthly', [sel('khmer_all'), sel('math_general'), sel('social_all')]).map(g => g.name)
  check('it appears with no config change', !before.includes('សិក្សាសង្គម') && after.includes('សិក្សាសង្គម'))
}

// ---------------------------------------------------------------------------
console.log('\nCase 3 — the teacher removes Science')
{
  const after = groupsForClass('monthly', [sel('khmer_all'), sel('math_general')]).map(g => g.name)
  check('វិទ្យាសាស្ត្រ disappears from the presentation', !after.includes('វិទ្យាសាស្ត្រ'))
}

// ---------------------------------------------------------------------------
console.log('\nCase 4 — nothing configured, and nothing resolvable')
{
  check('no selection still yields the full template (never an empty page)',
    groupsForClass('monthly', []).length > 0)
  // Every row hidden — a school admin can do this — is the state the §22 empty
  // state exists for.
  const allHidden = seed.map(r => ({ ...r, hidden: true }))
  const subjects = applySelection(resolveTemplate(allHidden, 'monthly', CONTEXT), [])
  check('an all-hidden template yields no groups, which triggers the empty state',
    groupsFromTemplate(subjects).length === 0)
}

// ---------------------------------------------------------------------------
console.log('\nCase 10 — historical data still averages to the same number')
{
  // A pupil marked under the full curriculum, before the class ever configured.
  const scores = {
    kh_listen: 8, kh_speak: 7, kh_read: 9, kh_write: 6,
    math_num: 8, math_meas: 7,
    // Nothing under science, social, health, extras — the common real case.
  }
  const full = flatten(groupsForClass('monthly', []))
  const narrowed = flatten(groupsForClass('monthly', [sel('khmer_all'), sel('math_general')]))

  const a = averageOver(full, scores)
  const b = averageOver(narrowed, scores)
  check('narrowing to the taught subjects does not move the average',
    Math.abs(a - b) < 1e-9, `full ${a}, narrowed ${b}`)
  check('and the average is the plain mean of what was recorded',
    Math.abs(a - 45 / 6) < 1e-9, `got ${a}`)

  // The one case where it legitimately does move: a mark under a subject the
  // class has since removed. Stated here so the behaviour is deliberate.
  const withScience = { ...scores, sci_phy: 2 }
  check('a mark under a de-configured subject stops counting (documented)',
    averageOver(full, withScience) !== averageOver(narrowed, withScience))
}

// ---------------------------------------------------------------------------
console.log('\nSubject performance (§13)')
{
  const groups = groupsForClass('monthly', [sel('khmer_all'), sel('math_general')])
  const rows = [
    student('a', 'ក', { kh_listen: 8, kh_speak: 8, math_num: 6, math_meas: 6 }),
    student('b', 'ខ', { kh_listen: 9, kh_speak: 9, math_num: 5, math_meas: 5 }),
  ]
  const perf = subjectPerformance(groups, rows, {}, 10)

  check('one entry per taught subject', perf.length === 2)
  check('strongest first', perf[0].name === 'ភាសាខ្មែរ' && perf[1].name === 'គណិតវិទ្យា',
    `got ${perf.map(p => p.name).join(', ')}`)
  check('ភាសាខ្មែរ averages 8.5', perf[0].average === 8.5, `got ${perf[0].average}`)
  check('គណិតវិទ្យា averages 5.5', perf[1].average === 5.5, `got ${perf[1].average}`)
  check('the mean is over all marks, not over column means',
    perf[0].count === 4, `counted ${perf[0].count}`)
  check('a subject with no marks is omitted',
    subjectPerformance(groups, [student('c', 'គ', {})], {}, 10).length === 0)
}

// ---------------------------------------------------------------------------
console.log('\nAttention list (§14)')
{
  const groups = groupsForClass('monthly', [sel('khmer_all'), sel('math_general')])
  const scheme = DEFAULT_SCHEME_CONFIG   // primary: /10, pass 5

  const failing = student('a', 'ក', { kh_listen: 8, kh_speak: 8, math_num: 1, math_meas: 1 })
  failing.finalAverageForRank = 4.5
  const passing = student('b', 'ខ', { kh_listen: 8, math_num: 8 })
  passing.finalAverageForRank = 8
  const unmarked = student('c', 'គ', {})
  unmarked.finalAverageForRank = 0

  const list = attentionList([failing, passing, unmarked], groups, scheme, {})
  check('only pupils below the pass mark are listed',
    list.length === 1 && list[0].student.id === 'a', `got ${list.map(l => l.student.id).join(',')}`)
  check('an unmarked pupil is NOT listed as failing',
    !list.some(l => l.student.id === 'c'))
  check('the weakest subject is named', list[0].weakestSubject?.name === 'គណិតវិទ្យា',
    `got ${list[0].weakestSubject?.name}`)
  check('the threshold comes from the scheme, not a constant',
    attentionList([failing], groups, { ...scheme, passMark: 4 }, {}).length === 0)
}

// ---------------------------------------------------------------------------
console.log('\nSummary + sorting')
{
  const a = student('a', 'ខ', {}); a.finalAverageForRank = 6
  const b = student('b', 'ក', {}); b.finalAverageForRank = 9
  const c = student('c', 'គ', {}); c.finalAverageForRank = 0

  check('top performer is the highest average', topPerformer([a, b, c])?.student.id === 'b')
  check('an unmarked class has no top performer', topPerformer([c]) === null)

  const numbers = new Map([['a', 1], ['b', 2], ['c', 3]])
  check('sort by average desc', sortRows([a, b, c], 'average_desc', numbers).map(r => r.id).join() === 'b,a,c')
  check('sort by average asc', sortRows([a, b, c], 'average_asc', numbers).map(r => r.id).join() === 'c,a,b')
  check('sort by roster order', sortRows([c, b, a], 'rank', numbers).map(r => r.id).join() === 'a,b,c')
  check('sorting does not mutate the input', (() => {
    const input = [a, b, c]
    sortRows(input, 'average_desc', numbers)
    return input.map(r => r.id).join() === 'a,b,c'
  })())
}

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ score total behaves as specified.')
