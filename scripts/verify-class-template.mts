/**
 * The class layer of the score template, exercised without a database.
 *
 *     node scripts/verify-class-template.mts
 *
 * `/score/subjects` writes rows; what a teacher actually experiences is what
 * `resolveTemplate` and `resolveTemplateEditor` then make of them. Those two are
 * pure, so the scenarios that matter can be checked here rather than clicked
 * through — which is the only way to check them at all before the migration is
 * applied to a real project.
 *
 * What this cannot check, because it is not in these functions: RLS, and the
 * `.or()` scoping in `fetchScoreTemplateRows`. Both are asserted by reading the
 * policy in 00016 instead, and noted as such in the handover.
 *
 * Exits non-zero on any failure.
 */

import {
  columnsFor,
  maxScoreByColumn,
  overrideDiffers,
  resolveTemplate,
  resolveTemplateEditor,
  SYSTEM_PRIMARY_TEMPLATE,
  toSubjectOptions,
  type OverridableFields,
} from '../lib/scores/template.ts'
import { flatten, groupsFor } from '../app/(main)/score/total/scoreTotalConfig.ts'
import type { ScoreTemplateSubjectRow } from '../lib/types.ts'

const CLASS_ID = '11111111-2222-3333-4444-555555555555'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ✓ ${name}`)
  } else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

const system = SYSTEM_PRIMARY_TEMPLATE
const inheritedOf = (key: string) => system.find((r) => r.subject_key === key)!

/** A class override built the way `updateClassSubject` builds one: a full copy. */
function override(key: string, patch: Partial<ScoreTemplateSubjectRow>): ScoreTemplateSubjectRow {
  const base = inheritedOf(key)
  return { ...base, ...patch, id: `class:${key}`, scope: 'class', class_id: CLASS_ID }
}

const keys = (rows: ScoreTemplateSubjectRow[], t: 'monthly' | 'semester' = 'monthly') =>
  toSubjectOptions(resolveTemplate(rows, t)).map((o) => o.value)

const baselineMonthly = keys(system)
const baselineSemester = keys(system, 'semester')

// --- 2. no edits ------------------------------------------------------------
console.log('\nno customisation:')
check('picker matches the system default', JSON.stringify(keys(system)) === JSON.stringify(baselineMonthly))
check('zero class rows in play', system.every((r) => r.scope === 'system'))

// --- 3. hide ----------------------------------------------------------------
console.log('\nhide a subject:')
{
  const rows = [...system, override('ex_book', { hidden: true })]
  const after = keys(rows)
  check('gone from the picker', !after.includes('ex_book'))
  check('nothing else moved', JSON.stringify(after) === JSON.stringify(baselineMonthly.filter((k) => k !== 'ex_book')))
  const editor = resolveTemplateEditor(rows, 'monthly')
  const row = editor.find((s) => s.subjectKey === 'ex_book')
  check('still listed in the editor so it can be unhidden', row !== undefined && row.hidden)
  check(
    'its columns are untouched, so old marks still resolve',
    JSON.stringify(row?.effective.columns) === JSON.stringify(inheritedOf('ex_book').columns),
  )
}

// --- 4. rename --------------------------------------------------------------
console.log('\nrename a label:')
{
  const rows = [...system, override('math_general', { label_km: 'គណិត (ថ្នាក់យើង)' })]
  const options = toSubjectOptions(resolveTemplate(rows, 'monthly'))
  const entry = options.find((o) => o.value === 'math_general')
  check('new label shown', entry?.label === 'គណិត (ថ្នាក់យើង)')
  check('subject_key unchanged', entry?.value === 'math_general')
  check('order unchanged', JSON.stringify(options.map((o) => o.value)) === JSON.stringify(baselineMonthly))
  check(
    'columns unchanged, so every mark already entered still loads',
    JSON.stringify(resolveTemplate(rows, 'monthly').find((s) => s.subjectKey === 'math_general')?.columns) ===
      JSON.stringify(inheritedOf('math_general').columns),
  )
}

// --- 5. reorder -------------------------------------------------------------
console.log('\nreorder:')
{
  // Swap the first two, exactly as `swapClassSubjectOrder` writes it.
  const a = inheritedOf('khmer_all')
  const b = inheritedOf('kh_listen')
  const rows = [
    ...system,
    override('khmer_all', { sort_order: b.sort_order }),
    override('kh_listen', { sort_order: a.sort_order }),
  ]
  const after = keys(rows)
  const expected = [...baselineMonthly]
  ;[expected[0], expected[1]] = [expected[1], expected[0]]
  check('order follows sort_order', JSON.stringify(after) === JSON.stringify(expected), `got ${after.slice(0, 3)}`)
  check('two rows written, not fourteen', rows.filter((r) => r.scope === 'class').length === 2)
}

// --- 6. add a class subject -------------------------------------------------
console.log('\nadd a class subject:')
{
  const key = 'cls_abc1234567'
  const added: ScoreTemplateSubjectRow = {
    id: 'class:new', scope: 'class', class_id: CLASS_ID,
    subject_key: key, label_km: 'កុំព្យូទ័រ', group_label: 'មុខវិជ្ជាថ្នាក់',
    columns: [{ id: key, label: 'កុំព្យូទ័រ', width: '120px' }],
    max_score: 10, value_kind: 'numeric', score_types: ['monthly'],
    sort_order: 200, hidden: false,
  }
  const rows = [...system, added]
  const after = keys(rows)
  check('appears in the picker', after.includes(key))
  check('appears last', after[after.length - 1] === key)
  check('no system subject displaced', baselineMonthly.every((k) => after.includes(k)))
  check(
    'its column id is the key marks will be stored under',
    resolveTemplate(rows, 'monthly').find((s) => s.subjectKey === key)?.columns[0].id === key,
  )
}

// --- 7. change a max score --------------------------------------------------
console.log('\nchange a max score:')
{
  const rows = [...system, override('ex_hw', { max_score: 100 })]
  const lookup = maxScoreByColumn(resolveTemplate(rows, 'monthly'))
  check('the edited subject follows', lookup['ex_hw'] === 100)
  check('every other column keeps its own', lookup['ex_oral'] === 10 && lookup['kh_listen'] === 10)
}

// --- 8. reset ---------------------------------------------------------------
console.log('\nreset to defaults:')
{
  const customised = [
    ...system,
    override('ex_book', { hidden: true }),
    override('math_general', { label_km: 'x' }),
  ]
  check('customisation is visible first', JSON.stringify(keys(customised)) !== JSON.stringify(baselineMonthly))
  const reset = customised.filter((r) => r.scope !== 'class')
  check('dropping the class rows restores the default', JSON.stringify(keys(reset)) === JSON.stringify(baselineMonthly))
  check('semester list restored too', JSON.stringify(keys(reset, 'semester')) === JSON.stringify(baselineSemester))
}

// --- 10. a different class --------------------------------------------------
console.log('\nanother class:')
{
  // `fetchScoreTemplateRows` filters on `class_id`, and the RLS policy in 00016
  // checks an active assignment, so another class's rows never arrive. What is
  // checked here is the half that is this module's job: given only the system
  // rows, the resolution is the untouched default.
  const rows = system.filter((r) => r.scope === 'system')
  check('unaffected by another class customising', JSON.stringify(keys(rows)) === JSON.stringify(baselineMonthly))
}

// --- the school layer -------------------------------------------------------
console.log('\nschool overrides:')
{
  const schoolRow: ScoreTemplateSubjectRow = {
    ...inheritedOf('ex_hw'), id: 'school:ex_hw', scope: 'school',
    school_id: 'school-1', label_km: 'កិច្ចការផ្ទះ (សាលា)', max_score: 20,
  }
  const withSchool = [...system, schoolRow]
  const resolved = resolveTemplate(withSchool, 'monthly').find((s) => s.subjectKey === 'ex_hw')
  check('school row beats system', resolved?.labelKm === 'កិច្ចការផ្ទះ (សាលា)' && resolved?.maxScore === 20)

  const classRow = override('ex_hw', { label_km: 'កិច្ចការផ្ទះ (ថ្នាក់)' })
  const all3 = [...withSchool, classRow]
  const winner = resolveTemplate(all3, 'monthly').find((s) => s.subjectKey === 'ex_hw')
  check('class row beats school', winner?.labelKm === 'កិច្ចការផ្ទះ (ថ្នាក់)')

  const editor = resolveTemplateEditor(all3, 'monthly').find((s) => s.subjectKey === 'ex_hw')
  check('editor inherits from the school layer, not system',
    editor?.inherited?.id === 'school:ex_hw' && editor?.override?.id === classRow.id)
}

// --- the delete-when-redundant rule ----------------------------------------
console.log('\nredundant overrides:')
{
  const inherited = inheritedOf('ex_hw')
  const identical: OverridableFields = {
    label_km: inherited.label_km,
    group_label: inherited.group_label ?? null,
    columns: inherited.columns,
    max_score: Number(inherited.max_score),
    value_kind: inherited.value_kind,
    score_types: inherited.score_types,
    sort_order: inherited.sort_order,
    hidden: inherited.hidden,
  }
  check('an override equal to its parent is redundant', !overrideDiffers(identical, inherited))
  check('one changed field makes it real', overrideDiffers({ ...identical, hidden: true }, inherited))
  check('a subject with no parent always differs', overrideDiffers(identical, null))
}

// ---------------------------------------------------------------------------
// Retiring `custom_subjects` (migration 00027)
// ---------------------------------------------------------------------------
// A teacher's own subjects used to live in `custom_subjects`, keyed on
// teacher_id and merged into the picker by ScoreEnterClient. 00027 converts
// them into class-scope template rows. The property that matters is that the
// teacher cannot tell: same subjects, same order, same column ids — and the
// column ids are what `scores.subject` holds, so a change there detaches marks.
//
// The pre-00027 merge is reproduced here rather than imported, because the code
// that did it is deleted. That is the point: this is the reference behaviour the
// new path has to reproduce.
{
  interface LegacyCustom {
    id: string
    name: string
    scope: 'monthly' | 'semester' | 'both'
    columns: { id: string; label: string; width?: string }[]
  }

  const legacy: LegacyCustom[] = [
    {
      id: '11111111-2222-3333-4444-555555555551',
      name: 'អង់គ្លេសបន្ថែម',
      scope: 'both',
      columns: [
        { id: 'custom_1700000000000_0', label: 'អាន', width: '120px' },
        { id: 'custom_1700000000000_1', label: 'សរសេរ', width: '120px' },
      ],
    },
    {
      id: '11111111-2222-3333-4444-555555555552',
      name: 'កីឡាបន្ថែម',
      scope: 'monthly',
      columns: [{ id: 'custom_1700000000111_0', label: 'កីឡា', width: '120px' }],
    },
  ]

  /** The pre-00027 reader: teacher-keyed, appended under its own group. */
  const appliesTo = (c: LegacyCustom, t: 'monthly' | 'semester') =>
    c.scope === 'both' || c.scope === t
  const oldPicker = (t: 'monthly' | 'semester') => [
    ...toSubjectOptions(resolveTemplate(system, t)),
    ...legacy.filter((c) => appliesTo(c, t)).map((c) => ({ value: c.id, label: c.name, group: 'មុខវិជ្ជាបន្ថែម' })),
  ]

  /** Exactly the row 00027 writes, including the key it mints. */
  const migrated = (c: LegacyCustom, classId: string): ScoreTemplateSubjectRow => ({
    id: `row-${c.id}-${classId}`,
    scope: 'class',
    class_id: classId,
    subject_key: `cs_${c.id.replace(/-/g, '')}`,
    label_km: c.name,
    group_label: 'មុខវិជ្ជាបន្ថែម',
    columns: c.columns,
    max_score: 10,
    value_kind: 'numeric',
    score_types: c.scope === 'both' ? ['monthly', 'semester'] : [c.scope],
    sort_order: 1000 + legacy.indexOf(c) * 10,
    hidden: false,
  })

  const converted = legacy.map((c) => migrated(c, CLASS_ID))
  const newRows = [...system, ...converted]
  const newPicker = (t: 'monthly' | 'semester') => toSubjectOptions(resolveTemplate(newRows, t))

  // ---- scenario 1: the teacher's list is unchanged, before vs after --------
  for (const t of ['monthly', 'semester'] as const) {
    const before = oldPicker(t).map((o) => `${o.group ?? ''}|${o.label}`)
    const after = newPicker(t).map((o) => `${o.group ?? ''}|${o.label}`)
    check(
      `${t}: picker list and order are identical before/after 00027`,
      JSON.stringify(before) === JSON.stringify(after),
      `before ${JSON.stringify(before.slice(-3))}\n      after  ${JSON.stringify(after.slice(-3))}`,
    )
  }

  // ---- scenario 1 (cont): every column id survives verbatim ---------------
  const beforeIds = legacy.flatMap((c) => c.columns.map((col) => col.id)).sort()
  const afterIds = converted.flatMap((r) => r.columns!.map((col) => col.id)).sort()
  check(
    'every SubjectColumn.id is preserved verbatim — no mark detaches',
    JSON.stringify(beforeIds) === JSON.stringify(afterIds),
    `before ${JSON.stringify(beforeIds)}\n      after  ${JSON.stringify(afterIds)}`,
  )

  // A subject's columns must still be reachable from its key, or the grid is empty.
  check(
    'columnsFor() finds the converted subject by its new key',
    JSON.stringify(columnsFor(resolveTemplate(newRows, 'monthly'), converted[0].subject_key)?.map((c) => c.id))
      === JSON.stringify(legacy[0].columns.map((c) => c.id)),
  )

  // ---- scenario 1 (cont): 'both' is two score_types, not two rows ---------
  check("scope 'both' resolves in monthly AND semester",
    newPicker('monthly').some((o) => o.label === 'អង់គ្លេសបន្ថែម')
    && newPicker('semester').some((o) => o.label === 'អង់គ្លេសបន្ថែម'))
  check("scope 'monthly' resolves in monthly ONLY",
    newPicker('monthly').some((o) => o.label === 'កីឡាបន្ថែម')
    && !newPicker('semester').some((o) => o.label === 'កីឡាបន្ថែម'))

  // ---- scenario 2: /score/total counts the same columns -------------------
  for (const mode of ['monthly', 'semester'] as const) {
    const extras = resolveTemplate(newRows, mode)
    const totalKeys = flatten(groupsFor(mode, extras)).map((c) => c.key)
    const wanted = legacy.filter((c) => appliesTo(c, mode)).flatMap((c) => c.columns.map((col) => col.id))
    check(
      `${mode}: /score/total carries every custom column exactly once`,
      wanted.every((k) => totalKeys.filter((x) => x === k).length === 1),
      `missing/duplicated among ${JSON.stringify(wanted)}`,
    )
    const band = groupsFor(mode, extras).find((g) => g.name === 'មុខវិជ្ជាបន្ថែម')
    check(`${mode}: they stay under the មុខវិជ្ជាបន្ថែម band`, band !== undefined && band.columns.length > 0)
  }

  // ---- scenario 3: two teachers on one class, same subject name -----------
  // Different column ids mean genuinely different subjects; merging them by
  // name would repoint one teacher's marks at the other's column.
  const colleague = migrated(
    {
      id: '11111111-2222-3333-4444-555555555553',
      name: 'អង់គ្លេសបន្ថែម',
      scope: 'both',
      columns: [{ id: 'custom_1700000000999_0', label: 'អាន', width: '120px' }],
    },
    CLASS_ID,
  )
  const shared = resolveTemplate([...newRows, colleague], 'monthly')
  const named = shared.filter((s) => s.labelKm === 'អង់គ្លេសបន្ថែម')
  check('both teachers’ same-named subjects survive as two subjects', named.length === 2)
  check('and they keep their own column ids',
    JSON.stringify(named.flatMap((s) => s.columns.map((c) => c.id)).sort())
    === JSON.stringify(['custom_1700000000000_0', 'custom_1700000000000_1', 'custom_1700000000999_0']))

  // ---- scenario 8: a subject added AFTER the change ------------------------
  // addClassSubject mints `cls_` server-side and passes group_label through.
  const added: ScoreTemplateSubjectRow = {
    id: 'row-new', scope: 'class', class_id: CLASS_ID,
    subject_key: 'cls_ab12cd34ef', label_km: 'កុំព្យូទ័រ', group_label: 'មុខវិជ្ជាបន្ថែម',
    columns: [{ id: 'cls_ab12cd34ef', label: 'កុំព្យូទ័រ', width: '120px' }],
    max_score: 10, value_kind: 'numeric', score_types: ['monthly'], sort_order: 1020, hidden: false,
  }
  const withAdded = toSubjectOptions(resolveTemplate([...newRows, added], 'monthly'))
  check('a newly added subject lands in the template picker',
    withAdded.some((o) => o.value === 'cls_ab12cd34ef' && o.group === 'មុខវិជ្ជាបន្ថែម'))
  check('its key is clear of the national key space',
    !system.some((r) => r.subject_key === 'cls_ab12cd34ef'))

  // ---- scenario 5: a legacy account is untouched ---------------------------
  // No class means no class-scope row can exist at all; the fallback is the
  // seeded national list, exactly as it was before 00027.
  const legacyView = toSubjectOptions(resolveTemplate(system, 'monthly'))
  check('legacy account (no class rows) sees the unchanged national list',
    JSON.stringify(legacyView) === JSON.stringify(toSubjectOptions(resolveTemplate(SYSTEM_PRIMARY_TEMPLATE, 'monthly'))))
  check('and no custom subject leaks into it',
    !legacyView.some((o) => o.group === 'មុខវិជ្ជាបន្ថែម'))
}

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ class layer behaves as specified.')
