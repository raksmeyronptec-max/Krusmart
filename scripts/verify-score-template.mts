/**
 * The acceptance test for the score-template refactor.
 *
 *     node scripts/verify-score-template.mts
 *
 * The hard requirement of that change was that a teacher signed in today sees
 * the exact same subject picker tomorrow: the list moved from a literal array
 * in `ScoreEnterClient.tsx` to `score_template_subjects`, and nothing else was
 * supposed to change. This script proves it without a browser or a database.
 *
 * Four checks:
 *
 *   1. The picker. `BEFORE` is the `subjectOptions` literal as it stood in
 *      commit afff30a, transcribed by hand. `AFTER` is what
 *      `resolveTemplate(SYSTEM_PRIMARY_TEMPLATE, …)` produces — the same rows
 *      migration 00016 seeds. Value, label, group and order must all match.
 *
 *   2. The columns. Each seeded subject's `columns` must deep-equal
 *      `subjectConfigs[key]`, because the client now prefers the template's
 *      copy and falls back to the map. A typo in the seed would silently change
 *      which cells a teacher sees.
 *
 *   3. The SQL. `SYSTEM_PRIMARY_TEMPLATE` and the seed in
 *      `00016_score_templates.sql` are transcriptions of one another — the
 *      constant is what a browser falls back to, the SQL is what production
 *      will actually read. Drift between them is invisible until a teacher
 *      opens the page, so the SQL is parsed and compared field by field.
 *
 *   4. The maximum score. `ScoreEnterClient` used to hand the grid a literal
 *      `DEFAULT_SCHEME_CONFIG.maxScore` at every call site; it now hands over
 *      the per-column maximum resolved from the template. Every column of the
 *      seeded default must still resolve to the same number, or that rewiring
 *      changed what a teacher can type.
 *
 * Run it after touching the template constant, the seed, or the max-score
 * wiring.
 *
 * Exits non-zero on any difference.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  maxScoreByColumn,
  resolveTemplate,
  SYSTEM_PRIMARY_TEMPLATE,
  toSubjectOptions,
  type SubjectOption,
} from '../lib/scores/template.ts'
import { DEFAULT_SCHEME_CONFIG } from '../lib/grading/scheme.ts'
import { subjectConfigs } from '../app/(main)/score/enter/subjectConfigs.ts'

/** `subjectOptions` as it stood before the refactor, in order. */
const BEFORE: Record<'monthly' | 'semester', SubjectOption[]> = {
  monthly: [
    { value: 'khmer_all', label: 'ភាសាខ្មែរ (គ្រប់បំណិន)', group: 'ភាសាខ្មែរ' },
    { value: 'kh_listen', label: 'សមត្ថភាពស្តាប់', group: 'ភាសាខ្មែរ' },
    { value: 'kh_write', label: 'សមត្ថភាពសរសេរ', group: 'ភាសាខ្មែរ' },
    { value: 'kh_read', label: 'សមត្ថភាពអាន', group: 'ភាសាខ្មែរ' },
    { value: 'kh_speak', label: 'សមត្ថភាពនិយាយ', group: 'ភាសាខ្មែរ' },
    { value: 'math_general', label: 'គណិតវិទ្យា (គ្រប់ផ្នែក)', group: 'គណិតវិទ្យា' },
    { value: 'ex_oral', label: 'សំណួរផ្ទាល់មាត់', group: 'ការបំពេញបន្ថែម' },
    { value: 'ex_att', label: 'វត្តមាន', group: 'ការបំពេញបន្ថែម' },
    { value: 'ex_book', label: 'សៀវភៅ', group: 'ការបំពេញបន្ថែម' },
    { value: 'ex_hw', label: 'កិច្ចការផ្ទះ', group: 'ការបំពេញបន្ថែម' },
  ],
  semester: [
    { value: 'sem_math', label: 'គណិតវិទ្យា', group: 'មុខវិជ្ជាសិក្សា' },
    { value: 'sem_kh_reading', label: 'អំណាន', group: 'មុខវិជ្ជាសិក្សា' },
    { value: 'sem_behavior_all', label: 'វាយតម្លៃរួមទាំង៤', group: 'ការវាយតម្លៃអាកប្បកិរិយា' },
    { value: 'sem_eval_knowledge', label: 'ចំណេះដឹង', group: 'ការវាយតម្លៃអាកប្បកិរិយា' },
  ],
}

let failures = 0

function fail(message: string) {
  failures += 1
  console.error(`  ✗ ${message}`)
}

// --- 1. the picker ----------------------------------------------------------
for (const scoreType of ['monthly', 'semester'] as const) {
  const before = BEFORE[scoreType]
  const after = toSubjectOptions(resolveTemplate(SYSTEM_PRIMARY_TEMPLATE, scoreType))

  console.log(`\n${scoreType}: ${before.length} before, ${after.length} after`)

  if (before.length !== after.length) {
    fail(`length differs: ${before.length} → ${after.length}`)
  }

  const rows = Math.max(before.length, after.length)
  for (let i = 0; i < rows; i++) {
    const b = JSON.stringify(before[i] ?? null)
    const a = JSON.stringify(after[i] ?? null)
    if (b !== a) fail(`[${i}]\n      - ${b}\n      + ${a}`)
  }
}

// --- 2. the columns ---------------------------------------------------------
console.log('\ncolumns vs subjectConfigs:')
for (const row of SYSTEM_PRIMARY_TEMPLATE) {
  const fromMap = subjectConfigs[row.subject_key]
  if (!fromMap) {
    fail(`${row.subject_key}: no entry in subjectConfigs`)
    continue
  }
  const b = JSON.stringify(fromMap)
  const a = JSON.stringify(row.columns)
  if (b !== a) fail(`${row.subject_key}\n      - ${b}\n      + ${a}`)
}
if (failures === 0) console.log(`  ✓ ${SYSTEM_PRIMARY_TEMPLATE.length} subjects match`)

// --- 3. the SQL seed --------------------------------------------------------
// The seed's shape is fixed and its Khmer text contains no apostrophes, so the
// quoting is unambiguous and a targeted regex is honest here. If this ever
// stops matching, the seed's formatting changed and this check must be updated
// rather than deleted.
const SQL_PATH = fileURLToPath(new URL('../supabase/migrations/00016_score_templates.sql', import.meta.url))
const sql = readFileSync(SQL_PATH, 'utf8')

const TUPLE =
  /\('system',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([\s\S]*?)'::jsonb,\s*([\d.]+),\s*'([^']*)',\s*ARRAY\[([^\]]*)\]::TEXT\[\],\s*(\d+)\)/g

const seeded = [...sql.matchAll(TUPLE)].map((m) => ({
  subject_key: m[1],
  label_km: m[2],
  group_label: m[3],
  columns: JSON.parse(m[4]),
  max_score: Number(m[5]),
  value_kind: m[6],
  score_types: m[7].split(',').map((v) => v.trim().replace(/^'|'$/g, '')),
  sort_order: Number(m[8]),
}))

console.log(`\nSQL seed: ${seeded.length} rows parsed from 00016`)

if (seeded.length !== SYSTEM_PRIMARY_TEMPLATE.length) {
  fail(`SQL seeds ${seeded.length} rows, SYSTEM_PRIMARY_TEMPLATE has ${SYSTEM_PRIMARY_TEMPLATE.length}`)
}

for (const expected of SYSTEM_PRIMARY_TEMPLATE) {
  const actual = seeded.find((r) => r.subject_key === expected.subject_key)
  if (!actual) {
    fail(`${expected.subject_key}: missing from the SQL seed`)
    continue
  }
  const want = JSON.stringify({
    subject_key: expected.subject_key,
    label_km: expected.label_km,
    group_label: expected.group_label,
    columns: expected.columns,
    max_score: expected.max_score,
    value_kind: expected.value_kind,
    score_types: expected.score_types,
    sort_order: expected.sort_order,
  })
  const got = JSON.stringify(actual)
  if (want !== got) fail(`${expected.subject_key}\n      - ${want}\n      + ${got}`)
}
if (failures === 0) console.log(`  \u2713 SQL seed matches SYSTEM_PRIMARY_TEMPLATE`)

// --- 4. the maximum score ---------------------------------------------------
// Before: every input got DEFAULT_SCHEME_CONFIG.maxScore. After: each gets its
// own subject's. Identical for the seeded curriculum, which is the whole claim.
console.log('\nmax score per column:')
{
  const before = DEFAULT_SCHEME_CONFIG.maxScore
  let columns = 0

  for (const scoreType of ['monthly', 'semester'] as const) {
    const lookup = maxScoreByColumn(resolveTemplate(SYSTEM_PRIMARY_TEMPLATE, scoreType))
    for (const [columnId, after] of Object.entries(lookup)) {
      columns += 1
      if (after !== before) fail(`${scoreType} ${columnId}\n      - ${before}\n      + ${after}`)
    }
  }

  if (failures === 0) console.log(`  \u2713 ${columns} columns all still ${before}`)
}

// --- verdict ----------------------------------------------------------------
if (failures > 0) {
  console.error(`\n${failures} difference(s). The picker is NOT identical.`)
  process.exit(1)
}
console.log('\n✓ picker and columns are byte-identical to the pre-refactor list.')
