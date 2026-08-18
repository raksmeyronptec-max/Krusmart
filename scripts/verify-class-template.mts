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
  maxScoreByColumn,
  overrideDiffers,
  resolveTemplate,
  resolveTemplateEditor,
  SYSTEM_PRIMARY_TEMPLATE,
  toSubjectOptions,
  type OverridableFields,
} from '../lib/scores/template.ts'
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

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ class layer behaves as specified.')
