/**
 * The acceptance test for the subject → components fold.
 *
 *     node scripts/verify-subject-fold.mts
 *
 * `/score/subjects` used to offer the primary curriculum's thirty-four monthly
 * rows as thirty-four independent choices. Twenty-three of them are the other
 * eleven said again: `khmer_all` carries `kh_read` as a column, and `kh_read` is
 * *also* seeded as a subject of its own, so the two write the identical
 * `scores.subject` value. `lib/scores/curriculum.ts` folds the restatements into
 * their bundle as components.
 *
 * Two properties matter more than the tidier screen, and both are about what
 * must NOT happen:
 *
 *   1. NO COLUMN MAY DISAPPEAR. Folding is a presentation change; if a column id
 *      the curriculum defines stops being reachable, marks recorded under it
 *      stop being enterable, which is indistinguishable from data loss.
 *
 *   2. A CLASS CONFIGURED BEFORE THE FOLD MUST KEEP ITS SUBJECTS. A class that
 *      selected the standalone `kh_read` has no `khmer_all` row at all, and must
 *      still open this screen with ភាសាខ្មែរ on and អាន ticked.
 *
 * The curriculum under test is parsed out of migration 00028 itself rather than
 * retyped here — a fixture that drifts from the seed would verify nothing. The
 * fourteen-row fallback in `template.ts` and a synthetic secondary curriculum
 * are checked alongside it, because the fold rule is generic and must not
 * special-case primary.
 *
 * No browser and no database: everything below is pure.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  resolveTemplate,
  SYSTEM_PRIMARY_TEMPLATE,
  type EffectiveSubject,
} from '../lib/scores/template.ts'
import {
  entryState,
  foldCurriculum,
  groupEntries,
  planComponentToggle,
  planEntryToggle,
  planSelectionChange,
  previewColumns,
  selectionSummary,
} from '../lib/scores/curriculum.ts'
import { coefficientOf } from '../lib/grading/scheme.ts'
import { schemeForLevel } from '../lib/grading/levelSchemes.ts'
import type { ClassSubjectSelection } from '../lib/scores/selection.ts'
import type { ScoreTemplateSubjectRow } from '../lib/types.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ✓ ${name}`)
  } else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

const sel = (
  subjectKey: string,
  sortOrder = 0,
  enabledColumns: string[] | null = null,
): ClassSubjectSelection => ({ subjectKey, enabledColumns, sortOrder })

const byKey = (list: ClassSubjectSelection[]) => new Map(list.map((s) => [s.subjectKey, s]))

// ---------------------------------------------------------------------------
// The seeded primary curriculum, read from the migration that seeds it.
// ---------------------------------------------------------------------------

/**
 * Grade 1's system rows out of 00028.
 *
 * The six grades are seeded identically (see that file's header), so grade 1 is
 * the whole primary curriculum. Parsed rather than copied: the point of this
 * harness is that the fold matches what the database actually holds.
 */
function seededPrimaryRows(grade: number): ScoreTemplateSubjectRow[] {
  const sql = readFileSync(
    join(ROOT, 'supabase/migrations/00028_primary_curriculum_and_class_selection.sql'),
    'utf8',
  )

  const row =
    /\('system',\s*'primary',\s*(\d+),\s*'([a-z_0-9]+)',\s*'([^']*)',\s*'([^']*)',\s*'(\[.*?\])'::jsonb,\s*([\d.]+),\s*'(numeric|text)',\s*ARRAY\[([^\]]*)\]::TEXT\[\],\s*(\d+)\)/g

  const out: ScoreTemplateSubjectRow[] = []
  for (const m of sql.matchAll(row)) {
    if (Number(m[1]) !== grade) continue
    out.push({
      id: `system:${m[2]}`,
      scope: 'system',
      level_key: 'primary',
      grade_number: Number(m[1]),
      subject_key: m[2],
      label_km: m[3],
      group_label: m[4],
      columns: JSON.parse(m[5]),
      max_score: Number(m[6]),
      value_kind: m[7] as 'numeric' | 'text',
      score_types: [...m[8].matchAll(/'([a-z]+)'/g)].map((s) => s[1]),
      sort_order: Number(m[9]),
      hidden: false,
    })
  }
  return out
}

const primaryRows = seededPrimaryRows(1)
const primaryMonthly = resolveTemplate(primaryRows, 'monthly', { levelKey: 'primary', gradeNumber: 1 })
const primarySemester = resolveTemplate(primaryRows, 'semester', { levelKey: 'primary', gradeNumber: 1 })

console.log('\nthe curriculum under test comes from migration 00028, not a fixture:')
check('grade 1 seeds 52 system rows', primaryRows.length === 52, `got ${primaryRows.length}`)
check('34 of them are monthly', primaryMonthly.length === 34, `got ${primaryMonthly.length}`)
check('18 of them are semester', primarySemester.length === 18, `got ${primarySemester.length}`)

// ---------------------------------------------------------------------------
console.log('\nCase 1 — the monthly curriculum folds 34 → 11')
{
  const { entries, absorbedBy } = foldCurriculum(primaryMonthly)

  check('eleven subjects to decide about, not thirty-four',
    entries.length === 11, `got ${entries.length}: ${entries.map((e) => e.subjectKey).join(', ')}`)
  check('twenty-three rows were absorbed as components',
    absorbedBy.size === 23, `got ${absorbedBy.size}`)
  check('every original row is either an entry or absorbed',
    entries.length + absorbedBy.size === primaryMonthly.length)

  const keys = entries.map((e) => e.subjectKey)
  check('the five bundles survive as entries',
    ['khmer_all', 'math_general', 'science_all', 'social_all', 'health_all'].every((k) => keys.includes(k)),
    `got ${keys.join(', ')}`)
  check('the standalone subjects with no bundle survive too',
    ['life_skill', 'foreign', 'ex_oral', 'ex_att', 'ex_book', 'ex_hw'].every((k) => keys.includes(k)))
  check('the restatements are gone from the top level',
    !keys.some((k) => ['kh_read', 'math_num', 'sci_phy', 'soc_geo', 'pe_sport'].includes(k)))

  check('ភាសាខ្មែរ absorbed all seven of its skills',
    absorbedBy.get('kh_read') === 'khmer_all' && absorbedBy.get('kh_essay') === 'khmer_all')
  const khmer = entries.find((e) => e.subjectKey === 'khmer_all')!
  check('and offers them as seven components', khmer.components.length === 7)
  check('each component names the standalone row it replaces',
    khmer.components.find((c) => c.columnId === 'kh_read')?.aliasSubjectKey === 'kh_read')

  // `life_skill` is a subject key AND its own only column id. Matching itself
  // is identity, not absorption — the case a naive rule swallows.
  check('a one-column subject does not absorb itself', !absorbedBy.has('life_skill'))
  check('and still appears with its single component',
    entries.find((e) => e.subjectKey === 'life_skill')?.components.length === 1)

  // The extras share no columns with any bundle, so they must stay whole.
  check('the four ការបំពេញបន្ថែម extras are untouched',
    ['ex_oral', 'ex_att', 'ex_book', 'ex_hw'].every(
      (k) => entries.find((e) => e.subjectKey === k)?.components.length === 1))
}

// ---------------------------------------------------------------------------
console.log('\nCase 2 — the semester curriculum folds 18 → 14')
{
  const { entries, absorbedBy } = foldCurriculum(primarySemester)
  check('fourteen entries', entries.length === 14, `got ${entries.length}`)
  check('the four behaviour ratings folded into វាយតម្លៃរួមទាំង៤',
    absorbedBy.size === 4 && absorbedBy.get('sem_eval_moral') === 'sem_behavior_all',
    `got ${absorbedBy.size}`)

  const behaviour = entries.find((e) => e.subjectKey === 'sem_behavior_all')!
  check('its components keep their dropdown type and options',
    behaviour.components.every((c) => c.type === 'select' && (c.options?.length ?? 0) === 4))
  check('the thirteen ordinary semester subjects are untouched',
    entries.filter((e) => e.subjectKey.startsWith('sem_') && e.components.length === 1).length === 13)
}

// ---------------------------------------------------------------------------
console.log('\nCase 3 — NO COLUMN MAY DISAPPEAR (the data-safety property)')
{
  for (const [label, subjects] of [
    ['monthly', primaryMonthly],
    ['semester', primarySemester],
  ] as const) {
    const before = new Set(subjects.flatMap((s) => s.columns.map((c) => c.id)))
    const { entries } = foldCurriculum(subjects)
    const after = entries.flatMap((e) => e.components.map((c) => c.columnId))

    check(`${label}: every column id the curriculum defines is still reachable`,
      [...before].every((id) => after.includes(id)),
      `missing ${[...before].filter((id) => !after.includes(id)).join(', ')}`)
    check(`${label}: and each appears exactly once, so no column is doubled`,
      after.length === new Set(after).size && after.length === before.size,
      `${after.length} components for ${before.size} column ids`)
  }
}

// ---------------------------------------------------------------------------
console.log('\nCase 4 — a class configured on the OLD flat screen keeps its subjects')
{
  const { entries } = foldCurriculum(primaryMonthly)
  const khmer = entries.find((e) => e.subjectKey === 'khmer_all')!

  // What the old picker wrote: three standalone skills, no khmer_all row.
  const legacy = byKey([sel('kh_read', 10), sel('kh_write', 20), sel('ex_hw', 30)])
  const state = entryState(khmer, legacy)

  check('ភាសាខ្មែរ reads as taught, even with no khmer_all row', state.on === true)
  check('exactly the two skills it selected are ticked',
    JSON.stringify(state.columnIds) === JSON.stringify(['kh_read', 'kh_write']),
    `got ${JSON.stringify(state.columnIds)}`)
  check('the legacy rows are reported so the next write can migrate them',
    JSON.stringify(state.aliasKeys.sort()) === JSON.stringify(['kh_read', 'kh_write']))

  // Ticking a third skill migrates the pair onto the bundle in the same write.
  const plan = planComponentToggle(khmer, 'kh_speak', legacy)
  check('the write consolidates onto khmer_all',
    plan.upsert.length === 1 && plan.upsert[0].subjectKey === 'khmer_all')
  check('carrying all three columns',
    JSON.stringify(plan.upsert[0].enabledColumns) === JSON.stringify(['kh_speak', 'kh_read', 'kh_write']),
    `got ${JSON.stringify(plan.upsert[0].enabledColumns)}`)
  check('and drops the two standalone rows it replaces',
    JSON.stringify(plan.remove.sort()) === JSON.stringify(['kh_read', 'kh_write']))
  check('THE MIGRATION MOVES NO MARK — the column ids are identical either way',
    plan.upsert[0].enabledColumns!.includes('kh_read') && plan.remove.includes('kh_read'))

  check('an unrelated selection is left alone', !plan.remove.includes('ex_hw'))
}

// ---------------------------------------------------------------------------
console.log('\nCase 5 — the write plan follows the storage convention')
{
  const { entries } = foldCurriculum(primaryMonthly)
  const khmer = entries.find((e) => e.subjectKey === 'khmer_all')!
  const all = khmer.components.map((c) => c.columnId)

  check('every component wanted stores NULL, so later curriculum edits reach the class',
    planSelectionChange(khmer, all, byKey([])).upsert[0].enabledColumns === null)
  check('a subset stores the subset',
    JSON.stringify(planSelectionChange(khmer, ['kh_read'], byKey([])).upsert[0].enabledColumns)
      === JSON.stringify(['kh_read']))
  check('the subset is stored in curriculum order, not click order',
    JSON.stringify(planSelectionChange(khmer, ['kh_write', 'kh_listen'], byKey([])).upsert[0].enabledColumns)
      === JSON.stringify(['kh_listen', 'kh_write']))
  check('a column that is not this subject’s is ignored, never written',
    JSON.stringify(planSelectionChange(khmer, ['kh_read', 'math_num'], byKey([])).upsert[0].enabledColumns)
      === JSON.stringify(['kh_read']))

  // Switching off must take the alias rows with it, or the next read switches
  // the subject straight back on.
  const mixed = byKey([sel('khmer_all', 10, ['kh_read']), sel('kh_write', 20)])
  const off = planEntryToggle(khmer, mixed)
  check('switching a subject off writes nothing', off.upsert.length === 0)
  check('and removes its own row AND every alias row',
    JSON.stringify(off.remove.sort()) === JSON.stringify(['kh_write', 'khmer_all']),
    `got ${JSON.stringify(off.remove)}`)

  check('switching an untouched subject off is a no-op, not a delete of nothing',
    planEntryToggle(khmer, byKey([])).remove.length === 0)
  check('switching one on selects every component',
    planEntryToggle(khmer, byKey([])).upsert[0].enabledColumns === null)
}

// ---------------------------------------------------------------------------
console.log('\nCase 6 — the fold rule is generic, not a primary special case')
{
  // Secondary (00021/00026): single-column subjects with distinct keys.
  const secondary: EffectiveSubject[] = ['hs_math', 'hs_physics', 'hs_khmer'].map((key, i) => ({
    subjectKey: key,
    labelKm: key,
    groupLabel: 'មុខវិជ្ជាសិក្សា',
    maxScore: 100,
    columns: [{ id: key, label: key }],
    valueKind: 'numeric',
    sortOrder: (i + 1) * 10,
    origin: 'system',
  }))
  const folded = foldCurriculum(secondary)
  check('a curriculum with no bundles folds to itself',
    folded.entries.length === 3 && folded.absorbedBy.size === 0)

  // The group boundary: `pe_sport` belongs to អប់រំសុខភាព's bundle. A same-named
  // column under a different heading must not be swallowed by it.
  const crossGroup: EffectiveSubject[] = [
    { subjectKey: 'health_all', labelKm: 'អប់រំសុខភាព', groupLabel: 'អប់រំសុខភាព', maxScore: 10,
      columns: [{ id: 'pe_sport', label: 'អប់រំកាយ' }, { id: 'health_hygiene', label: 'សុខភាព' }],
      valueKind: 'numeric', sortOrder: 10, origin: 'system' },
    { subjectKey: 'cls_sport', labelKm: 'កីឡា', groupLabel: 'មុខវិជ្ជាផ្សេងៗ', maxScore: 10,
      columns: [{ id: 'pe_sport', label: 'អប់រំកាយ' }],
      valueKind: 'numeric', sortOrder: 20, origin: 'class' },
  ]
  const crossed = foldCurriculum(crossGroup)
  check('a bundle cannot absorb across a group heading',
    crossed.entries.length === 2 && !crossed.absorbedBy.has('cls_sport'))
  check('and a teacher’s own subject is flagged as theirs',
    crossed.entries.find((e) => e.subjectKey === 'cls_sport')?.isTeacherAdded === true)

  // The fourteen-row fallback for a database where 00028 has not run.
  const fbMonthly = foldCurriculum(resolveTemplate(SYSTEM_PRIMARY_TEMPLATE, 'monthly'))
  check('the untagged fallback folds too, losing nothing',
    fbMonthly.entries.length + fbMonthly.absorbedBy.size
      === resolveTemplate(SYSTEM_PRIMARY_TEMPLATE, 'monthly').length)
  check('and ភាសាខ្មែរ swallows the four skills it carries there',
    fbMonthly.absorbedBy.get('kh_read') === 'khmer_all' && fbMonthly.absorbedBy.size === 4,
    `got ${fbMonthly.absorbedBy.size}`)
}

// ---------------------------------------------------------------------------
console.log('\nCase 7 — the summary and preview describe the same grid /score/enter renders')
{
  const { entries } = foldCurriculum(primaryMonthly)

  // Unconfigured: applySelection falls back to the whole curriculum, so the
  // screen must describe the whole curriculum rather than "0 subjects".
  const empty = byKey([])
  const none = selectionSummary(entries, empty)
  check('an unconfigured class is described as teaching everything',
    none.configured === false && none.subjects === 11)
  check('and its preview shows every column the grid would render',
    previewColumns(entries, empty).length === new Set(
      primaryMonthly.flatMap((s) => s.columns.map((c) => c.id))).size)

  const chosen = byKey([sel('khmer_all', 10, ['kh_read', 'kh_write']), sel('math_general', 20)])
  const some = selectionSummary(entries, chosen)
  check('a configured class counts its own subjects', some.configured === true && some.subjects === 2)
  check('and counts COLUMNS, which is what a teacher types into',
    some.columns === 7, `2 Khmer skills + 5 maths parts, got ${some.columns}`)

  const preview = previewColumns(entries, chosen)
  check('the preview lists exactly those columns in curriculum order',
    JSON.stringify(preview.map((c) => c.columnId))
      === JSON.stringify(['kh_read', 'kh_write', 'math_num', 'math_meas', 'math_geo', 'math_alg', 'math_stat']),
    `got ${JSON.stringify(preview.map((c) => c.columnId))}`)
  check('each column names the subject it belongs to',
    preview[0].subjectLabel.startsWith('ភាសាខ្មែរ'))
}

// ---------------------------------------------------------------------------
console.log('\nCase 8 — grouping keeps the register’s order')
{
  const { entries } = foldCurriculum(primaryMonthly)
  const groups = groupEntries(entries)
  check('seven headings for primary monthly', groups.length === 7, `got ${groups.map((g) => g.label).join(', ')}`)
  check('ភាសាខ្មែរ leads, as the curriculum sorts it', groups[0].label === 'ភាសាខ្មែរ')
  check('every entry lands in exactly one group',
    groups.reduce((n, g) => n + g.entries.length, 0) === entries.length)
}

// ---------------------------------------------------------------------------
console.log('\nCase 9 — មេគុណ belongs to the level, not to the full mark')
{
  // ★ The regression this pins. `/score/subjects` showed an unconditional
  // `max ÷ 50`, so a primary teacher marking out of 10 was told មេគុណ 0.2 —
  // a number that multiplies nothing in the app. Design §3.2: បឋមសិក្សា is
  // `weighting: 'simple'`, where every subject weighs exactly 1.
  const primary = schemeForLevel('primary')
  const secondary = schemeForLevel('lower_secondary')

  check('primary grades on `simple` weighting', primary.weighting !== 'coefficient')
  check('a primary /10 subject weighs 1, NOT 0.2',
    coefficientOf(10, primary) === 1, `got ${coefficientOf(10, primary)}`)
  check('and still weighs 1 when a teacher marks it out of 20',
    coefficientOf(20, primary) === 1,
    'under simple weighting the full mark sets the scale, never the weight')
  check('and out of 100',
    coefficientOf(100, primary) === 1)

  check('secondary DOES weight by the full mark — ៥០ ពិន្ទុ = មេគុណ ១',
    secondary.weighting === 'coefficient' && coefficientOf(50, secondary) === 1)
  check('so /100 counts double there', coefficientOf(100, secondary) === 2)
  check('and /25 counts half', coefficientOf(25, secondary) === 0.5)

  // An unresolved level must grade exactly as the app did before levels
  // existed, which is primary.
  check('no level resolved falls back to primary, so it never invents a weight',
    coefficientOf(10, schemeForLevel(null)) === 1)

  // The level-blind helper must not come back: it is unusable correctly,
  // because a coefficient cannot be derived from a full mark alone.
  const templateSrc = readFileSync(join(ROOT, 'lib/scores/template.ts'), 'utf8')
  check('template.ts exports no level-blind coefficient helper',
    !/export function coefficientFor|export const COEFFICIENT_BASE/.test(templateSrc),
    'it divided by 50 unconditionally and was shown to primary teachers')

  const screen = readFileSync(
    join(ROOT, 'app/(main)/score/subjects/ScoreSubjectsClient.tsx'), 'utf8')
  check('the subjects screen resolves the class\'s own scheme',
    screen.includes('schemeForLevel(templateContext?.levelKey)'))
  // Comments stripped first: the screen's own note *names* the removed helper
  // in the paragraph explaining why it is gone. Prose is not code.
  const screenCode = screen.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
  check('and reads the coefficient through it',
    screenCode.includes('coefficientOf(') && !/coefficientFor\(/.test(screenCode))
  check('the odd-coefficient warning is silent under simple weighting',
    /scheme\.weighting !== 'coefficient'\) return null/.test(screen),
    'it fired on the untouched primary default and asked a teacher to confirm មេគុណ 0.2')
}

// ---------------------------------------------------------------------------
console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
