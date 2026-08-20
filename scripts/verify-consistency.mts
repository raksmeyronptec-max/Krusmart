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
  assignableSubjects,
  filterRowsForContext,
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

// --- the secondary curriculum, parsed from 00026 (which supersedes 00021's seed)
const SQL = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/00026_secondary_classroom_curriculum.sql', import.meta.url)),
  'utf8',
)
// Track is NULL for grades 7–10 and quoted for 11–12, hence the alternation.
const TUPLE =
  /\('system',\s*'([a-z_]+)',\s*(\d+),\s*(?:'([a-z_]+)'|NULL),\s*'([a-z_]+)',\s*'([^']*)',\s*NULL,\s*'([\s\S]*?)'::jsonb,\s*(\d+),\s*'([^']*)',\s*ARRAY\[([^\]]*)\]::TEXT\[\],\s*(\d+)\)/g
const seeds: ScoreTemplateSubjectRow[] = [...SQL.matchAll(TUPLE)].map((m, i) => ({
  id: `seed:${i}`, scope: 'system' as const,
  level_key: m[1] as ScoreTemplateSubjectRow['level_key'],
  grade_number: Number(m[2]), track: (m[3] ?? null) as ScoreTemplateSubjectRow['track'],
  subject_key: m[4], label_km: m[5], group_label: null,
  columns: JSON.parse(m[6]), max_score: Number(m[7]),
  value_kind: m[8] as 'numeric' | 'text',
  score_types: m[9].split(',').map((v) => v.trim().replace(/^'|'$/g, '')),
  sort_order: Number(m[10]), hidden: false,
}))
if (seeds.length !== 105) {
  console.error(`expected 105 seeded rows from 00026, parsed ${seeds.length}`)
  process.exit(1)
}
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
    // Row-driven surfaces: they average whatever was marked. Identical to the
    // template-keyed ones here because every mark in the fixture belongs to
    // the curriculum and carries the same per-column weight.
    studentTracking: rowKeys,
    dashboard: rowKeys,
    studentDetail: rowKeys,
    scoreAnalyse: rowKeys,
    parentPortal: rowKeys,
    ministryPrint: level ? templateKeys : FALLBACK_NUMERIC_KEYS.monthly,
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
// 100/100 + 60/75 + 60/75 + 60/75 + 40/50, the other seven unmarked:
// Σscore 320 ÷ Σcoef (2+1.5+1.5+1.5+1) = 320/7.5 = 42.67 → B, ល្អណាស់.
assertConsistent(
  'grade-12 science — partial data (seven subjects unmarked)',
  { hs_math: 100, hs_physics: 60, hs_chemistry: 60, hs_khmer: 60, hs_history: 40, hs_biology: null },
  { levelKey: 'upper_secondary', gradeNumber: 12, track: 'science' },
  { average: 42.67, letter: 'B', label: 'ល្អណាស់' },
)

// --- 3. grade-12 social science, full marks across all 13 subjects ---------------
// Σ800 ÷ Σ16 = 50 exactly — the checksum row, as a pupil.
assertConsistent(
  'grade-12 social science — full marks',
  { hs_khmer: 100, hs_math: 75, hs_physics: 50, hs_chemistry: 50, hs_biology: 50,
    hs_earth: 50, hs_history: 75, hs_geography: 75, hs_moral_civics: 75,
    hs_foreign: 50, hs_ict: 50, hs_pe: 50, hs_econ: 50 },
  { levelKey: 'upper_secondary', gradeNumber: 12, track: 'social_science' },
  { average: 50, letter: 'A', label: 'ល្អប្រសើរ' },
)

// --- 3b. grade-8 (lower secondary) — the fifth combination, real data now --------
// 90/100 + 80/100 + 40/50: Σ210 ÷ Σcoef (2+2+1) = 42 → B on the /50 ladder.
assertConsistent(
  'grade-8 lower secondary — partial data',
  { hs_khmer: 90, hs_math: 80, hs_physics: 40 },
  { levelKey: 'lower_secondary', gradeNumber: 8, track: null },
  { average: 42, letter: 'B', label: 'ល្អណាស់' },
)

// --- 4. missing ≠ zero ------------------------------------------------------------
assertConsistent(
  'grade-12 science — one subject marked, none dragged to zero',
  { hs_history: 25, hs_math: null, hs_physics: null, hs_chemistry: null, hs_biology: null, hs_khmer: null },
  { levelKey: 'upper_secondary', gradeNumber: 12, track: 'science' },
  { average: 25, letter: 'E', label: 'មធ្យម' },
)

// --- 5. the level/track matrix, regression rows -------------------------------------
console.log('\nregression ladders:')
{
  const PRIMARY: [number, string][] = [[9,'A'],[8,'B'],[7,'C'],[6,'D'],[5,'E'],[4,'F']]
  const SECONDARY: [number, string][] = [[45,'A'],[40,'B'],[35,'C'],[30,'D'],[25,'E'],[24,'F']]

  for (const [avg, letter] of PRIMARY) {
    check(`primary ${avg}/10 → ${letter}`,
      gradeFor(avg, DEFAULT_SCHEME_CONFIG)?.letter === letter,
      `got ${gradeFor(avg, DEFAULT_SCHEME_CONFIG)?.letter}`)
  }
  const secScheme = schemeForLevel('lower_secondary')
  for (const [avg, letter] of SECONDARY) {
    check(`secondary ${avg}/50 → ${letter}`,
      gradeFor(avg, secScheme)?.letter === letter,
      `got ${gradeFor(avg, secScheme)?.letter}`)
  }
  check('lower and upper secondary share one scheme',
    JSON.stringify(schemeForLevel('lower_secondary')) === JSON.stringify(schemeForLevel('upper_secondary')))
}

// --- 5b. equivalence on LETTER and PERCENTAGE — never on descriptor ------------------
console.log('\nequivalence (letter + percentage, not descriptor):')
{
  const cases: [number, number][] = [[9, 10], [45, 50], [90, 100], [112, 125]]
  const letters = cases.map(([avg, scale]) => gradeFor(avg, schemeForLevel('upper_secondary'), scale)?.letter)
  check('9/10 ≡ 45/50 ≡ 90/100 ≡ 112/125 on letter',
    letters.every((l) => l === 'A'), `got ${letters.join(',')}`)
  check('…and on percentage (≥90% of their own scale)',
    cases.every(([avg, scale]) => (avg / scale) * 100 >= 89.5))

  // The descriptors differ BY DESIGN — the secondary ladder is shifted one
  // step. Asserting equality here would be asserting a bug, so assert the
  // difference instead.
  check('primary A is ល្អណាស់, secondary A is ល្អប្រសើរ — different by design',
    gradeFor(9, DEFAULT_SCHEME_CONFIG)?.label === 'ល្អណាស់' &&
    gradeFor(45, schemeForLevel('upper_secondary'))?.label === 'ល្អប្រសើរ')
  check('secondary B reuses the primary A word (ladder shifted one step)',
    gradeFor(40, schemeForLevel('upper_secondary'))?.label === 'ល្អណាស់')
}

// --- 5c. lower secondary resolves its real curriculum; unset track still falls back
console.log('\nlower secondary (seeded by 00026) and the unset-track gate:')
{
  const ctx: TemplateContext = { levelKey: 'lower_secondary', gradeNumber: 8, track: null }
  const subjects = resolveTemplate(allRows, 'monthly', ctx)
  check('grade 8 resolves its real 14 subjects', subjects.length === 14,
    `got ${subjects.length}`)
  check('…totalling 800 marks (Σcoefficient 16)',
    subjects.reduce((a, s) => a + s.maxScore, 0) === 800)
  check('grade 7 has no chemistry and no economics',
    resolveTemplate(allRows, 'monthly', { levelKey: 'lower_secondary', gradeNumber: 7, track: null })
      .every((s) => s.subjectKey !== 'hs_chemistry' && s.subjectKey !== 'hs_econ'))

  // A grade 11–12 class whose stream is unset must keep falling back to the
  // primary list — every 11–12 row carries an explicit track on purpose, so a
  // partial /50 curriculum can never leak into an unstreamed class.
  const unset = resolveTemplate(allRows, 'monthly', { levelKey: 'upper_secondary', gradeNumber: 12, track: null })
  check('grade 12 with no track falls back to the primary list — never empty', unset.length > 0)
  check('…and therefore grades on /10, not a half-applied /50',
    unset.every((s) => s.maxScore === DEFAULT_SCHEME_CONFIG.maxScore))
}

// --- 5d. MULTI-TEACHER: the same class, marks owned by different teachers ------------
// The secondary model splits one class's marks across subject teachers. What
// must hold is that aggregation depends on the *marks*, never on who entered
// them — so the same pupil's average is identical however ownership is spread,
// and every surface still agrees on it.
//
// The marks are deliberately at different fractions of their maxima: an
// earlier fixture had them all at 80%, which made every subset average the
// same and would have let an owner-filtered read pass unnoticed.
console.log('\nmulti-teacher class:')
{
  const ctx: TemplateContext = { levelKey: 'upper_secondary', gradeNumber: 12, track: 'science' }

  const owned = [
    { subject: 'hs_math', value: 100, teacherId: 'teacher-A' },      // coef 2
    { subject: 'hs_physics', value: 45, teacherId: 'teacher-B' },    // coef 1.5
    { subject: 'hs_chemistry', value: 60, teacherId: 'teacher-B' },  // coef 1.5
    { subject: 'hs_khmer', value: 60, teacherId: 'teacher-C' },      // coef 1.5
    { subject: 'hs_history', value: 25, teacherId: 'teacher-D' },    // coef 1
  ]

  // Σ290 ÷ Σ7.5 = 38.666… → 38.67, a C on the secondary ladder.
  const asClass = Object.fromEntries(owned.map((m) => [m.subject, m.value]))
  const classResults = surfaceResults(asClass, ctx)
  const names = Object.keys(classResults)
  const classAvg = classResults.scoreTotal.average

  check('every surface agrees on the multi-teacher average (38.67)',
    classAvg === 38.67 && names.every((n) => classResults[n].average === classAvg),
    names.map((n) => `${n}=${classResults[n].average}`).join(' '))
  check('…and on the letter (C)', names.every((n) => classResults[n].letter === 'C'))
  check('…and on the descriptor',
    names.every((n) => classResults[n].label === classResults[names[0]].label))

  // The bug this phase fixed: reading only the reader's own rows. Each
  // teacher's slice genuinely differs from the class figure, so a surviving
  // owner filter could not pass this.
  for (const [reader, expected] of [['teacher-A', 50], ['teacher-B', 35]] as const) {
    const ownedOnly = Object.fromEntries(
      owned.filter((m) => m.teacherId === reader).map((m) => [m.subject, m.value]),
    )
    const narrowed = surfaceResults(ownedOnly, ctx).scoreTotal.average
    check(`${reader}'s own rows alone average ${expected} — an owner filter would show that`,
      narrowed === expected && narrowed !== classAvg,
      `got ${narrowed}`)
  }

  // Ownership is not an input to the calculation at all.
  const reshuffled = Object.fromEntries([...owned].reverse().map((m) => [m.subject, m.value]))
  check('reshuffling ownership changes nothing',
    surfaceResults(reshuffled, ctx).scoreTotal.average === classAvg)

  // A subject nobody entered stays missing, not zero — the unassigned-subject
  // case /score/collect flags. Dropping history (25/50) lifts the average to
  // Σ265 ÷ Σ6.5 = 40.77, which is the point: it is not dragged to zero.
  const missingOne = { ...asClass }
  delete (missingOne as Record<string, number>).hs_history
  const withGap = surfaceResults(missingOne, ctx)
  check('an unentered subject drops out rather than scoring zero',
    withGap.scoreTotal.average === 40.77, `got ${withGap.scoreTotal.average}`)
  check('…and every surface still agrees',
    Object.keys(withGap).every((n) => withGap[n].average === withGap.scoreTotal.average))
  check('…and it is not the zero-filled figure (Σ265 ÷ Σ7.5 = 35.33)',
    withGap.scoreTotal.average !== 35.33)
}

// --- 6. ranks: shared walk, ties share ---------------------------------------------
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

// --- subject identity: the assignment picker vs /score/collect ------------------
//
// The admin console's assignment picker and /score/collect both derive their
// subject list from assignableSubjects / resolveTemplate over the same rows.
// These checks pin that: every subject either surface shows carries the same
// label on the other, in every curriculum context — which is the user-visible
// acceptance test for the identity convergence ("one subject name everywhere").
console.log('\nassignment picker vs /score/collect labels:')
const CONTEXTS: [string, TemplateContext | null][] = [
  ['primary (context null)', null],
  ['grade 8 lower secondary', { levelKey: 'lower_secondary', gradeNumber: 8, track: null }],
  ['grade 12 science', { levelKey: 'upper_secondary', gradeNumber: 12, track: 'science' }],
  ['grade 12 social', { levelKey: 'upper_secondary', gradeNumber: 12, track: 'social_science' }],
]
for (const [name, context] of CONTEXTS) {
  const picker = assignableSubjects(allRows, context)
  const byKey = new Map(picker.map((o) => [o.subjectKey, o.labelKm]))
  // /score/collect's list, built exactly as getCollectionOverview builds it.
  const source = filterRowsForContext(allRows, context)
  for (const scoreType of ['monthly', 'semester'] as const) {
    const collect = resolveTemplate(source, scoreType, context)
    const missing = collect.filter((c) => byKey.get(c.subjectKey) !== c.labelKm)
    check(`${name} / ${scoreType}: every collect subject is offered under the same label (${collect.length})`,
      collect.length > 0 && missing.length === 0,
      missing.map((m) => `${m.subjectKey}: collect="${m.labelKm}" picker="${byKey.get(m.subjectKey) ?? '(absent)'}"`).join('; '))
  }
}

// Grade-12 science must offer that track's twelve subjects and nothing else —
// not the primary list, not the other stream's. A picker offering a subject
// the class does not teach is how a teacher gets assigned to an empty column.
{
  const sci = assignableSubjects(allRows, CONTEXTS[2][1])
  const keys = sci.map((o) => o.subjectKey).sort()
  const expected = seeds
    .filter((r) => r.grade_number === 12 && r.track === 'science')
    .map((r) => r.subject_key).sort()
  check(`grade 12 science picker ≡ the twelve seeded science subjects`,
    keys.length === 12 && JSON.stringify(keys) === JSON.stringify(expected),
    `got ${keys.length}: ${JSON.stringify(keys)}`)
  check('grade 12 science picker offers no primary subject',
    !keys.some((k) => SYSTEM_PRIMARY_TEMPLATE.some((r) => r.subject_key === k)))
}

// Primary is the union of the monthly and semester pickers, unchanged — the
// convergence must not alter what a primary or legacy account is offered.
{
  const primary = assignableSubjects(allRows, null)
  const union = new Set<string>()
  for (const t of ['monthly', 'semester'] as const)
    for (const sub of resolveTemplate(SYSTEM_PRIMARY_TEMPLATE, t, null)) union.add(sub.subjectKey)
  check(`primary picker ≡ monthly ∪ semester of the shipped template (${union.size})`,
    primary.length === union.size && primary.every((o) => union.has(o.subjectKey)))
  // And with NO rows at all (a database missing 00016), the fallback inside
  // assignableSubjects must produce the identical list.
  const fallback = assignableSubjects([], null)
  check('empty-rows fallback ≡ the same primary list',
    JSON.stringify(fallback) === JSON.stringify(primary))
}

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ one student, one result — across every surface.')
