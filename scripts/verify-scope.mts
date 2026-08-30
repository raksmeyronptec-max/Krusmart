/**
 * The default-class rule, checked offline.
 *
 *     node scripts/verify-scope.mts
 *
 * `resolveServerScope` decides which class a request reads and writes marks
 * for. Before C0 it picked that class with `find(a => a.is_homeroom)` over a
 * query carrying no `ORDER BY`, which is deterministic only while a teacher has
 * exactly one homeroom row. `/classroom/classes` ends that: migration 00003
 * keys homeroom uniqueness on *(teacher, class, year)*, so several homeroom
 * rows in one year are legal, and `createClassAndAssign` writes
 * `is_homeroom: true` every time.
 *
 * Static inspection cannot show that the replacement is stable — the failure is
 * about *input order*, so the check has to feed the same set in several orders
 * and demand one answer. That is what this does.
 *
 * The scope resolver itself is `server-only` and opens a Supabase connection,
 * so what is exercised here is the pure rule it delegates to. The SQL `ORDER
 * BY` is the other half and is asserted by reading the source, below.
 *
 * Exits non-zero on any failure.
 */

import { readFileSync } from 'node:fs'
import { chooseAssignment, orderAssignments } from '../lib/utils/defaultClass.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

/** Terse constructor: an assignment is only four fields to this rule. */
function a(id: string, classId: string, homeroom: boolean, created: string) {
  return {
    id,
    class_id: classId,
    academic_year_id: 'year-1',
    is_homeroom: homeroom,
    created_at: created,
  }
}

/** Every ordering of a list — the point is that none of them may matter. */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  )
}

// --- 1. several homerooms, no ?class= -------------------------------------------
console.log('\nmultiple active homerooms, no ?class= (the C4 case):')

const septemberFirst = a('as-1', 'class-sept', true, '2026-09-01T08:00:00Z')
const januarySecond = a('as-2', 'class-jan', true, '2027-01-15T08:00:00Z')
const marchThird = a('as-3', 'class-mar', true, '2027-03-20T08:00:00Z')
const threeHomerooms = [septemberFirst, januarySecond, marchThird]

const answers = new Set(
  permutations(threeHomerooms).map((order) => chooseAssignment(order)?.class_id),
)
check(
  `all ${permutations(threeHomerooms).length} input orders agree`,
  answers.size === 1,
  `got ${[...answers].join(', ')}`,
)
check(
  'the oldest homeroom wins',
  chooseAssignment(threeHomerooms)?.class_id === 'class-sept',
  `got ${chooseAssignment(threeHomerooms)?.class_id}`,
)

// The property that makes the default usable: it is not a moving target.
console.log('\nadding a newer class does not move the default:')
let roster = [septemberFirst]
check('one class → that class', chooseAssignment(roster)?.class_id === 'class-sept')
roster = [...roster, januarySecond]
check('second class created → still the first', chooseAssignment(roster)?.class_id === 'class-sept')
roster = [marchThird, ...roster]
check('third, prepended → still the first', chooseAssignment(roster)?.class_id === 'class-sept')

// --- 2. ?class= overrides ---------------------------------------------------------
console.log('\n?class= is a request, honoured only when held:')
check(
  'names a held class → that class',
  chooseAssignment(threeHomerooms, 'class-mar')?.class_id === 'class-mar',
)
check(
  'names the default explicitly → the default',
  chooseAssignment(threeHomerooms, 'class-sept')?.class_id === 'class-sept',
)
check(
  'names a class not held → falls back, never widens',
  chooseAssignment(threeHomerooms, 'class-someone-elses')?.class_id === 'class-sept',
)
check('empty string is not a request', chooseAssignment(threeHomerooms, '')?.class_id === 'class-sept')

// --- 3. homeroom outranks a subject row -------------------------------------------
console.log('\nhomeroom outranks a subject assignment, whatever the dates say:')
const subjectRowOlder = a('as-4', 'class-physics', false, '2020-01-01T00:00:00Z')
const mixed = [subjectRowOlder, januarySecond]
check(
  'an older subject row does not become the default',
  chooseAssignment(mixed)?.class_id === 'class-jan',
  `got ${chooseAssignment(mixed)?.class_id}`,
)
check(
  'but a subject-only teacher still resolves to their class',
  chooseAssignment([subjectRowOlder])?.class_id === 'class-physics',
)
check(
  'and may still request it',
  chooseAssignment(mixed, 'class-physics')?.class_id === 'class-physics',
)

// --- 4. total order: no tie is left to input order ---------------------------------
console.log('\nthe order is total — ties are broken, not deferred:')
const sameInstantA = a('bbb', 'class-b', true, '2026-09-01T08:00:00Z')
const sameInstantB = a('aaa', 'class-a', true, '2026-09-01T08:00:00Z')
check(
  'identical created_at → id decides, both ways round',
  chooseAssignment([sameInstantA, sameInstantB])?.class_id === 'class-a' &&
    chooseAssignment([sameInstantB, sameInstantA])?.class_id === 'class-a',
)

const noTimestamp = { ...a('as-5', 'class-unknown', true, ''), created_at: undefined }
check(
  'a row with no created_at sorts last, never becomes the default',
  chooseAssignment([noTimestamp, januarySecond])?.class_id === 'class-jan',
)

check('no assignments → undefined, the caller falls back to legacy scope',
  chooseAssignment([]) === undefined)
check('orderAssignments does not mutate its input',
  (() => {
    const input = [marchThird, septemberFirst]
    orderAssignments(input)
    return input[0].id === 'as-3'
  })())

// --- 5. the SQL half ---------------------------------------------------------------
// The pure rule above is only half the guarantee: PostgREST applies a LIMIT-free
// select, but a caller reading a *subset* would still depend on row order, and
// the query is where that is settled. Asserted by reading the source, because
// running it needs a database.
console.log('\nresolveServerScope carries the matching ORDER BY:')
const source = readFileSync(new URL('../lib/utils/serverScope.ts', import.meta.url), 'utf8')
const query = source.slice(
  source.indexOf("from('teacher_assignments')"),
  source.indexOf('const assignments ='),
)
check("orders is_homeroom descending", /\.order\('is_homeroom', \{ ascending: false/.test(query))
check("then created_at ascending", /\.order\('created_at', \{ ascending: true/.test(query))
check("then id, so the SQL order is total too", /\.order\('id', \{ ascending: true/.test(query))
check('selects created_at, which the ordering needs', /select\([^)]*created_at/.test(query))
check('still filters to the caller and to active rows',
  /\.eq\('teacher_id', userId\)/.test(query) && /\.eq\('status', 'active'\)/.test(query))
check('delegates the choice rather than re-deriving it',
  source.includes('chooseAssignment(assignments, requestedClassId)'))

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ the default class is deterministic: the oldest active homeroom, and ?class= still overrides.')
