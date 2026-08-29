/**
 * The acceptance test for the score clamp.
 *
 *     node scripts/verify-clamp.mts
 *
 * `<input type="number" max>` is a validation constraint, not an input filter:
 * typing 11 into a /10 cell delivered '11' to onChange and wrote
 * `score_value = 11` to Postgres under a success toast. `clampScoreCell` closes
 * that on every path a mark travels — typing, pasting, bulk fill,
 * copy-from-last-month, and `saveScores` itself.
 *
 * The riskiest property is the one that must NOT clamp: the four `sem_eval_*`
 * columns store Khmer words in `score_text` (migration 00012), and a clamp
 * built on a bare parseFloat would coerce them to NULL under a success toast —
 * the exact bug 00012 fixed. So half of this file asserts pass-through.
 */

import { clampScoreCell, splitScoreCell } from '../lib/utils/score-value.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures += 1; console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) }
}

// ---------------------------------------------------------------------------
// The eight rows of the specification table, verbatim.
// ---------------------------------------------------------------------------
console.log('clamp table:')

const TABLE: [raw: string, max: number, expected: string, why: string][] = [
  ['', 10, '', 'empty = not assessed, not zero'],
  ['8.5', 10, '8.5', 'in range passes as typed'],
  ['11', 10, '10', 'over max snaps to max'],
  ['10.01', 10, '10', 'fractionally over still snaps'],
  ['-3', 10, '0', 'negative snaps to zero'],
  ['55', 50, '50', 'a /50 secondary column clamps at 50'],
  ['1.', 10, '1.', 'an in-progress decimal keeps its trailing point'],
  ['ល្អ', 10, 'ល្អ', 'a Khmer word passes through untouched'],
]

for (const [raw, max, expected, why] of TABLE) {
  const got = clampScoreCell(raw, max)
  check(`'${raw}' max ${max} → '${expected}' (${why})`, got === expected, `got '${got}'`)
}

// ---------------------------------------------------------------------------
// The four behavioural ratings, and their round trip through splitScoreCell:
// the word must land in score_text with score_value NULL, exactly as if the
// clamp did not exist.
// ---------------------------------------------------------------------------
console.log('\nKhmer ratings survive the clamp:')

const RATINGS = ['ល្អ', 'ល្អបង្គួរ', 'មធ្យម', 'ខ្សោយ']

for (const word of RATINGS) {
  const clamped = clampScoreCell(word, 10)
  check(`'${word}' passes through`, clamped === word, `got '${clamped}'`)

  const { score_value, score_text } = splitScoreCell(clamped)
  check(
    `'${word}' round-trips into score_text with score_value NULL`,
    score_value === null && score_text === word,
    `got { score_value: ${score_value}, score_text: '${score_text}' }`,
  )
}

// ---------------------------------------------------------------------------
// The clamped number itself round-trips numerically — the saveScores path is
// clampScoreCell → splitScoreCell, so '11' must land as score_value 10.
// ---------------------------------------------------------------------------
console.log('\nclamp → split, the saveScores path:')

{
  const { score_value, score_text } = splitScoreCell(clampScoreCell('11', 10))
  check(
    "'11' stores score_value 10, score_text NULL",
    score_value === 10 && score_text === null,
    `got { score_value: ${score_value}, score_text: '${score_text}' }`,
  )
}
{
  const { score_value, score_text } = splitScoreCell(clampScoreCell('', 10))
  check(
    'an empty cell stores NULL in both columns',
    score_value === null && score_text === null,
    `got { score_value: ${score_value}, score_text: '${score_text}' }`,
  )
}

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ the clamp behaves as specified.')
