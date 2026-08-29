/**
 * The acceptance test for the primary curriculum / class-selection change.
 *
 *     node scripts/verify-primary-curriculum.mts
 *
 * Two properties matter more than any feature this change adds, and both are
 * about what must NOT happen:
 *
 *   1. A class that has never configured anything must resolve exactly the
 *      subject list it resolved before. Opt-in configuration with a cliff is
 *      worse than no configuration at all — to a teacher mid-term, a picker
 *      that lost their subjects is indistinguishable from lost marks.
 *
 *   2. Narrowing a template must never narrow an *aggregation*. Totals,
 *      rankings, certificates and reports weigh the class's whole curriculum
 *      whoever is looking at it; `applySelection` is only ever applied to the
 *      entry picker.
 *
 * Everything below runs without a browser or a database — the resolver and the
 * selection logic are pure, which is why they were written that way.
 *
 * Scenario numbering follows the master prompt's §H test cases.
 */

import {
  resolveTemplate,
  SYSTEM_PRIMARY_TEMPLATE,
  type EffectiveSubject,
} from '../lib/scores/template.ts'
import {
  applySelection,
  buildCatalog,
  filterColumns,
  hasConfiguredSelection,
  isTeacherAddedSubject,
  searchCatalog,
  type ClassSubjectSelection,
} from '../lib/scores/selection.ts'
import type { ScoreTemplateSubjectRow } from '../lib/types.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ✓ ${name}`)
  } else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

const CLASS_ID = '11111111-2222-3333-4444-555555555555'
const keys = (subjects: EffectiveSubject[]) => subjects.map((s) => s.subjectKey)
const sel = (subjectKey: string, sortOrder = 0, enabledColumns: string[] | null = null):
  ClassSubjectSelection => ({ subjectKey, enabledColumns, sortOrder })

const monthly = resolveTemplate(SYSTEM_PRIMARY_TEMPLATE, 'monthly')
const semester = resolveTemplate(SYSTEM_PRIMARY_TEMPLATE, 'semester')

// ---------------------------------------------------------------------------
console.log('\nCase 1 — a class with no template subjects')
{
  const empty: ClassSubjectSelection[] = []
  check('an unconfigured class resolves the FULL monthly list, unchanged',
    JSON.stringify(applySelection(monthly, empty)) === JSON.stringify(monthly))
  check('and the full semester list too',
    JSON.stringify(applySelection(semester, empty)) === JSON.stringify(semester))
  check('hasConfiguredSelection is false, which is what shows the setup state',
    hasConfiguredSelection(monthly, empty) === false)
}

// ---------------------------------------------------------------------------
console.log('\nCase 2 — the teacher adds Khmer and Maths')
{
  const chosen = [sel('khmer_all', 10), sel('math_general', 20)]
  const result = applySelection(monthly, chosen)

  check('the template holds exactly those two',
    JSON.stringify(keys(result)) === JSON.stringify(['khmer_all', 'math_general']),
    `got ${JSON.stringify(keys(result))}`)
  check('configuration is now detected', hasConfiguredSelection(monthly, chosen) === true)
  check('the selection decides the order, not the curriculum',
    JSON.stringify(keys(applySelection(monthly, [sel('math_general', 10), sel('khmer_all', 20)])))
      === JSON.stringify(['math_general', 'khmer_all']))
  check('column layouts survive the narrowing intact',
    result[0].columns.length === 7 && result[0].columns[0].id === 'kh_listen')
}

// ---------------------------------------------------------------------------
console.log('\nCase 3 — /score/enter offers only the configured subjects')
{
  const chosen = [sel('khmer_all', 10), sel('math_general', 20)]
  const offered = keys(applySelection(monthly, chosen))
  check('ex_oral is in the curriculum but NOT offered', keys(monthly).includes('ex_oral') && !offered.includes('ex_oral'))
  check('kh_read is in the curriculum but NOT offered', keys(monthly).includes('kh_read') && !offered.includes('kh_read'))

  // The property that keeps reports honest: aggregation reads the untouched
  // resolution, never the narrowed one.
  check('the full template is still available for totals and reports',
    keys(monthly).length > offered.length && keys(monthly).includes('ex_oral'))
}

// ---------------------------------------------------------------------------
console.log('\nCase 4 — a subject cannot be added twice')
{
  const chosen = [sel('khmer_all', 10)]
  const catalog = buildCatalog(monthly, chosen)
  const khmer = catalog.flatMap((g) => g.subjects).find((s) => s.subjectKey === 'khmer_all')!
  check('the picker marks an already-added subject as selected (UI layer)', khmer.selected === true)
  check('it is still listed, not hidden — so it cannot be re-invented', khmer !== undefined)

  // A duplicate that somehow reached the resolver must not double a row; the
  // database unique index is the third layer and the server action the second.
  const duped = applySelection(monthly, [sel('khmer_all', 10), sel('khmer_all', 20)])
  check('a duplicated selection still yields one row',
    duped.filter((s) => s.subjectKey === 'khmer_all').length === 1)
}

// ---------------------------------------------------------------------------
console.log('\nCase 5/6 — another class, another year')
{
  // Selections are keyed on class_id, and classes.academic_year_id pins the
  // year, so a different class is simply a different row set. The resolver
  // never sees another class's rows: RLS and the class_id filter both exclude
  // them. What this asserts is that the *logic* carries no cross-class state.
  const classA = [sel('khmer_all', 10)]
  const classB = [sel('math_general', 10), sel('ex_hw', 20)]
  check('class A sees only its own choice',
    JSON.stringify(keys(applySelection(monthly, classA))) === JSON.stringify(['khmer_all']))
  check('class B sees only its own choice',
    JSON.stringify(keys(applySelection(monthly, classB))) === JSON.stringify(['math_general', 'ex_hw']))
}

// ---------------------------------------------------------------------------
console.log('\nCase 7 — a teacher-added subject stays distinguishable')
{
  const custom: ScoreTemplateSubjectRow = {
    id: 'row-custom', scope: 'class', class_id: CLASS_ID,
    subject_key: 'cls_ab12cd34ef', label_km: 'កុំព្យូទ័រ', group_label: 'មុខវិជ្ជាបន្ថែម',
    columns: [{ id: 'cls_ab12cd34ef', label: 'កុំព្យូទ័រ', width: '120px' }],
    max_score: 10, value_kind: 'numeric', score_types: ['monthly'], sort_order: 1020, hidden: false,
  }
  const withCustom = resolveTemplate([...SYSTEM_PRIMARY_TEMPLATE, custom], 'monthly')
  const catalog = buildCatalog(withCustom, [])
  const entry = catalog.flatMap((g) => g.subjects).find((s) => s.subjectKey === 'cls_ab12cd34ef')!

  check('the teacher-added subject appears in the catalogue', entry !== undefined)
  check('and is flagged teacherAdded', entry.teacherAdded === true)
  check('a national subject is NOT flagged', isTeacherAddedSubject('khmer_all') === false)
  check('a 00027-converted subject is flagged', isTeacherAddedSubject('cs_0011223344') === true)
  check('a cls_ subject is flagged', isTeacherAddedSubject('cls_ab12cd34ef') === true)

  // The trap this guards: a class row that merely *overrides* a national
  // subject also has origin 'class', but Khmer is still national.
  const overridden: ScoreTemplateSubjectRow = {
    ...SYSTEM_PRIMARY_TEMPLATE.find((r) => r.subject_key === 'khmer_all')!,
    id: 'row-override', scope: 'class', class_id: CLASS_ID, label_km: 'ភាសាខ្មែរ (កែ)',
  }
  const withOverride = resolveTemplate([...SYSTEM_PRIMARY_TEMPLATE, overridden], 'monthly')
  const khmerEntry = buildCatalog(withOverride, []).flatMap((g) => g.subjects)
    .find((s) => s.subjectKey === 'khmer_all')!
  check('an OVERRIDDEN national subject is not mistaken for a custom one',
    khmerEntry.teacherAdded === false && khmerEntry.labelKm === 'ភាសាខ្មែរ (កែ)')
}

// ---------------------------------------------------------------------------
console.log('\nCase 8 — an existing account is untouched')
{
  // The whole backward-compatibility claim in one assertion: with no selection
  // rows, every resolution is byte-identical to the pre-00028 behaviour.
  for (const scoreType of ['monthly', 'semester'] as const) {
    const before = resolveTemplate(SYSTEM_PRIMARY_TEMPLATE, scoreType)
    const after = applySelection(before, [])
    check(`${scoreType}: resolution is byte-identical with no selection`,
      JSON.stringify(before) === JSON.stringify(after))
  }

  // A selection naming only monthly subjects must not empty the semester grid.
  const monthlyOnly = [sel('khmer_all', 10), sel('math_general', 20)]
  check('a monthly-only selection leaves the semester grid at full strength',
    JSON.stringify(applySelection(semester, monthlyOnly)) === JSON.stringify(semester))
  check('and the semester grid still reports itself unconfigured',
    hasConfiguredSelection(semester, monthlyOnly) === false)

  // A stale selection naming subjects that no longer resolve must not blank
  // the grid either.
  check('a selection of vanished keys falls back to the full list',
    JSON.stringify(applySelection(monthly, [sel('gone_subject', 10)])) === JSON.stringify(monthly))
}

// ---------------------------------------------------------------------------
console.log('\nComponents — enabling a subset of a subject\'s columns')
{
  const khmer = monthly.find((s) => s.subjectKey === 'khmer_all')!
  check('the subject carries seven components', khmer.columns.length === 7)

  const four = applySelection(monthly, [sel('khmer_all', 10, ['kh_listen', 'kh_speak', 'kh_read', 'kh_write'])])
  check('only the enabled four reach the grid', four[0].columns.length === 4)
  check('and in definition order',
    JSON.stringify(four[0].columns.map((c) => c.id)) === JSON.stringify(['kh_listen', 'kh_speak', 'kh_read', 'kh_write']))

  check('null means every column', filterColumns(khmer.columns, null).length === 7)
  check('an empty list means every column, never zero', filterColumns(khmer.columns, []).length === 7)
  check('ids that no longer exist fall back to every column, never zero',
    filterColumns(khmer.columns, ['renamed_away']).length === 7)
}

// ---------------------------------------------------------------------------
console.log('\nCatalogue — grouping and search')
{
  const catalog = buildCatalog(monthly, [])
  check('subjects are grouped under their headings',
    catalog.some((g) => g.label === 'ភាសាខ្មែរ') && catalog.some((g) => g.label === 'ការបំពេញបន្ថែម'))
  check('every subject lands in exactly one group',
    catalog.reduce((n, g) => n + g.subjects.length, 0) === monthly.length)

  check('search matches a subject label', searchCatalog(catalog, 'គណិត').length > 0)
  check('search matches a component label',
    searchCatalog(catalog, 'អក្សរផ្ចង់').flatMap((g) => g.subjects).some((s) => s.subjectKey === 'khmer_all'))
  check('an empty query returns everything', searchCatalog(catalog, '   ').length === catalog.length)
  check('a miss returns nothing', searchCatalog(catalog, 'zzzznotasubject').length === 0)
}

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ primary curriculum + class selection behave as specified.')
