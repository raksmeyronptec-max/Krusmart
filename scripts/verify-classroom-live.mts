/**
 * §15 — the second class's enrolment backfill really is a no-op.
 *
 *     node scripts/verify-classroom-live.mts
 *
 * OPT-IN. Like `verify-ranking-live.mts` this one needs a running local
 * Supabase stack with every migration applied. It is not part of the default
 * suite, because it talks to a database and writes to it.
 *
 * ── Why it cannot be done offline ──────────────────────────────────────────
 *
 * `createClassAndAssign` calls `backfill_teacher_enrolments()` immediately
 * after inserting the assignment, and `/classroom` now calls that
 * action a *second*, *third*, *nth* time — which the onboarding wizard never
 * did, because it runs once. The claim that this is safe rests entirely on
 * 00019's predicate: it enrols only pupils with **no enrolment row at all**, so
 * after the first class every pupil already has one and later calls insert
 * nothing.
 *
 * That is a property of a `SECURITY DEFINER` function's SQL, invisible from the
 * call site and unprovable by reading TypeScript. Reading the migration and
 * assuming is exactly what the spec forbids, so this signs in as a real
 * teacher, builds the two-class scenario under their own JWT and RLS, and
 * checks what the database actually did.
 *
 * ── What it asserts ────────────────────────────────────────────────────────
 *
 *   1. the first backfill enrols the legacy roster (the onboarding case);
 *   2. the second, for a *new* class, returns 0 and writes nothing;
 *   3. no pupil ends up enrolled twice, or moved into the new class;
 *   4. the rows the first call wrote are untouched — same class, same status;
 *   5. a pupil created after class one is still picked up, so "no-op" means
 *      "nothing to do", not "the function stopped working".
 *
 * It creates its own teacher, school and pupils under a unique email and
 * removes every row it can before exiting. The auth user itself needs a
 * service role to delete and is left behind; that is why the email is stamped.
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

let fail = 0
const check = (n: string, ok: boolean, d = '') => {
  if (ok) console.log(`  ✓ ${n}`)
  else {
    fail += 1
    console.error(`  ✗ ${n}${d ? `\n      ${d}` : ''}`)
  }
}

const stamp = Date.now()
const EMAIL = `classroom-backfill-${stamp}@krusmart.local`
const PASSWORD = 'ClassroomBackfill12345!'

const sb = createClient(URL, ANON)

console.log('\nsetting up a teacher with a legacy roster:')

const { data: auth, error: authErr } = await sb.auth.signUp({
  email: EMAIL, password: PASSWORD,
})
check('a teacher can sign up', !authErr && Boolean(auth?.user), authErr?.message)
if (!auth?.user) {
  console.error('\ncannot continue without a session — is the local stack running?')
  process.exit(1)
}
const uid = auth.user.id

// The one SECURITY DEFINER escape hatch: it creates the school, grants owner,
// stamps profiles.school_id and opens an academic year.
const { data: schoolId, error: orgErr } = await sb.rpc('create_teacher_organisation', {
  p_school_name: `សាលាតេស្ត ${stamp}`,
  p_kind: 'school',
  p_year_name: '2026-2027',
})
check('their organisation is created', !orgErr && Boolean(schoolId), orgErr?.message)

const { data: year } = await sb
  .from('academic_years').select('id').eq('school_id', schoolId).limit(1).maybeSingle()
check('it opened an academic year', Boolean(year?.id))

// Level and grade, as onboarding seeds them.
const { data: level, error: levelErr } = await sb
  .from('education_levels')
  .insert({ school_id: schoolId, name: 'បឋមសិក្សា', name_en: 'Primary', sort_order: 1 })
  .select('id').single()
check('an education level can be seeded', !levelErr && Boolean(level?.id), levelErr?.message)

const { data: grade, error: gradeErr } = await sb
  .from('grades')
  .insert({ education_level_id: level!.id, name: 'ថ្នាក់ទី៥', sort_order: 5 })
  .select('id').single()
check('a grade can be seeded', !gradeErr && Boolean(grade?.id), gradeErr?.message)

// The legacy roster: students under `teacher_id`, with no enrolment row at all.
// This is exactly the shape 00019 exists to repair.
const ROSTER = 4
const { data: pupils, error: pupilErr } = await sb
  .from('students')
  .insert(
    Array.from({ length: ROSTER }, (_, i) => ({
      teacher_id: uid,
      student_id: `T${stamp}-${i + 1}`,
      name_kh: `សិស្ស ${i + 1}`,
      gender: i % 2 === 0 ? 'ប្រុស' : 'ស្រី',
      // `grade` is the class label the legacy path carried, not a letter mark.
      grade: '៥ក',
      dob: '2015-01-01',
    })),
  )
  .select('id')
check(`${ROSTER} legacy pupils exist, none enrolled`, !pupilErr && pupils?.length === ROSTER,
  pupilErr?.message)

/** Create a class and its homeroom assignment, then backfill — as the action does. */
async function createClass(name: string): Promise<{ classId: string; backfilled: number }> {
  const { data: cls } = await sb
    .from('classes')
    .insert({ grade_id: grade!.id, academic_year_id: year!.id, name })
    .select('id').single()

  await sb.from('teacher_assignments').insert({
    teacher_id: uid, class_id: cls!.id, academic_year_id: year!.id,
    is_homeroom: true, status: 'active',
  })

  const { data: n, error } = await sb.rpc('backfill_teacher_enrolments', { p_class_id: cls!.id })
  if (error) throw new Error(`backfill failed: ${error.message}`)
  return { classId: cls!.id as string, backfilled: Number(n ?? 0) }
}

// --- 1. the first class -----------------------------------------------------------
console.log('\nthe first class — the onboarding case:')
const first = await createClass('៥ក')
check(`the backfill enrols all ${ROSTER} legacy pupils`, first.backfilled === ROSTER,
  `returned ${first.backfilled}`)

const { data: afterFirst } = await sb
  .from('student_enrollments').select('id, student_id, class_id, status')
check(`${ROSTER} enrolment rows exist`, afterFirst?.length === ROSTER,
  `got ${afterFirst?.length}`)
check('all of them point at the first class',
  (afterFirst ?? []).every((r) => r.class_id === first.classId))

// --- 2. ★ the second class --------------------------------------------------------
console.log('\nthe second class — what /classroom makes routine:')
const second = await createClass('៥ខ')
check('★ the second backfill is a no-op', second.backfilled === 0,
  `returned ${second.backfilled} — 00019's predicate is not holding`)

const { data: afterSecond } = await sb
  .from('student_enrollments').select('id, student_id, class_id, status')

check('★ no enrolment was duplicated',
  afterSecond?.length === ROSTER, `${ROSTER} before, ${afterSecond?.length} after`)
check('★ every pupil is still enrolled exactly once',
  new Set((afterSecond ?? []).map((r) => r.student_id)).size === ROSTER)
check('★ nobody was dragged into the new class',
  (afterSecond ?? []).every((r) => r.class_id === first.classId))
check('the rows the first call wrote are untouched',
  (afterSecond ?? []).every((r) => r.status === 'active') &&
    JSON.stringify((afterSecond ?? []).map((r) => r.id).sort()) ===
      JSON.stringify((afterFirst ?? []).map((r) => r.id).sort()))
check('the second class exists and is genuinely empty',
  (afterSecond ?? []).filter((r) => r.class_id === second.classId).length === 0)

// --- 3. "no-op" must mean "nothing to do" ------------------------------------------
// A backfill that returned 0 because it broke would pass everything above.
console.log('\nthe function still works — 0 meant "nothing to do":')
const { data: latecomer } = await sb
  .from('students').insert({
    teacher_id: uid, student_id: `T${stamp}-late`, name_kh: 'សិស្សថ្មី',
    gender: 'ប្រុស', grade: '៥ខ', dob: '2015-01-01',
  })
  .select('id').single()

const { data: third, error: thirdErr } = await sb
  .rpc('backfill_teacher_enrolments', { p_class_id: second.classId })
check('a pupil with no enrolment is still picked up', Number(third ?? 0) === 1,
  thirdErr?.message ?? `returned ${third}`)

const { data: afterThird } = await sb
  .from('student_enrollments').select('student_id, class_id')
check('and lands in the class that was asked for',
  (afterThird ?? []).find((r) => r.student_id === latecomer?.id)?.class_id === second.classId)
check('while the original four stay where they were',
  (afterThird ?? []).filter((r) => r.class_id === first.classId).length === ROSTER)

// --- 4. multiple homerooms are legal, which is why C0 was needed --------------------
console.log('\nthe teacher now holds two active homeroom rows (00003 allows it):')
const { data: assignments } = await sb
  .from('teacher_assignments').select('class_id, is_homeroom, created_at')
  .eq('teacher_id', uid).eq('status', 'active')
check('two homeroom assignments, one year', 
  (assignments ?? []).filter((a) => a.is_homeroom).length === 2,
  `got ${(assignments ?? []).filter((a) => a.is_homeroom).length}`)
check('the oldest is the first class — what resolveServerScope now defaults to',
  [...(assignments ?? [])].sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)))[0]?.class_id === first.classId)

// --- cleanup ----------------------------------------------------------------------
// Own rows only, deepest first. The auth user needs a service role to remove and
// is left behind, which is why the email carries a timestamp.
console.log('\ncleaning up:')
await sb.from('student_enrollments').delete().in('class_id', [first.classId, second.classId])
await sb.from('teacher_assignments').delete().eq('teacher_id', uid)
await sb.from('students').delete().eq('teacher_id', uid)
await sb.from('classes').delete().in('id', [first.classId, second.classId])
const { data: leftover } = await sb.from('students').select('id').eq('teacher_id', uid)
check('the test roster is gone', (leftover ?? []).length === 0)

if (fail > 0) {
  console.error(`\n${fail} failure(s).`)
  process.exit(1)
}
console.log('\n✓ a second class creates no duplicate enrolments, and the backfill still works.')
