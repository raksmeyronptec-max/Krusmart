/**
 * The /classroom rollout's structural invariants.
 *
 *     node scripts/verify-classroom.mts
 *
 * Most of what can go wrong here is not a wrong value but a wrong *shape*: a
 * route quietly relocated under `/classroom/`, a second subject-configuration
 * screen, a second class-creation path that forgets the enrolment backfill, or
 * a `DELETE` where an archive belongs. None of those is visible from a page
 * that renders — they are visible from which files exist and what they call.
 *
 * So this reads the rollout's own source. It needs no database and no browser,
 * which is the point: these are the rules that must hold on every checkout.
 *
 * Exits non-zero on any failure.
 */

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

const root = new URL('../', import.meta.url)
const path = (p: string) => fileURLToPath(new URL(p, root))
const has = (p: string) => existsSync(path(p))
const read = (p: string) => (has(p) ? readFileSync(path(p), 'utf8') : '')

const HUB = 'app/(main)/classroom/page.tsx'

// --- 1. where the routes live -----------------------------------------------------
console.log('\nthe rollout adds two routes and no others:')

check('the hub exists', has(HUB))
check(
  'under app/(main)/, so it inherits the shell, the parent redirect and proxy.ts',
  has(HUB) && !has('app/classroom/page.tsx'),
)
check('it does not render its own <TopNav /> — the layout owns it',
  !read(HUB).includes('<TopNav'))

// ★ The rule the whole design rests on: the hub *links*, it does not absorb.
console.log('\nnothing was relocated under /classroom:')
for (const forbidden of [
  'app/(main)/classroom/students',
  'app/(main)/classroom/enrollment',
  'app/(main)/classroom/subjects',
  'app/(main)/classroom/student-list',
]) {
  check(`no ${forbidden.replace('app/(main)', '')}`, !has(forbidden))
}

console.log('\nthe screens it links to are still where they were:')
for (const kept of [
  'app/(main)/student-list/page.tsx',
  'app/(main)/students/[id]/page.tsx',
  'app/(main)/enrollment/page.tsx',
  'app/(main)/score/subjects/page.tsx',
]) {
  check(kept.replace('app/(main)', ''), has(kept))
}

// --- 2. the hub's four destinations ------------------------------------------------
console.log('\nthe hub offers exactly the four cards, pointing outward:')
const hub = read(HUB)
for (const [label, href] of [
  ['ថ្នាក់របស់ខ្ញុំ', '/classroom/classes'],
  ['សិស្សក្នុងថ្នាក់', '/student-list'],
  ['បញ្ចូលសិស្សថ្មី', '/enrollment'],
  ['មុខវិជ្ជា', '/score/subjects'],
] as const) {
  check(`${label} → ${href}`, hub.includes(`'${href}'`) && hub.includes(label))
}
check(
  'it reads no marks, no roster and no template — it is a discovery layer',
  !/from\('scores'\)|from\('students'\)|from\('student_enrollments'\)|from\('score_template_subjects'\)/.test(hub),
)
check(
  'it carries the class forward as ?class=, the existing mechanism',
  hub.includes('class=') && hub.includes('resolveServerScope'),
)

// --- 3. one subject-configuration screen -------------------------------------------
// `/score/template` is already a redirect to `/score/subjects` precisely because
// two screens editing one template is how they end up disagreeing.
console.log('\nthere is still exactly one subject-configuration screen:')
check(
  'the hub links to /score/subjects rather than reimplementing it',
  hub.includes('/score/subjects') &&
    !/score_template_subjects|class_template_subjects|addClassSubject/.test(hub),
)
check('/score/template is still a redirect, not a second one',
  read('app/(main)/score/template/page.tsx').includes('redirect'))

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ /classroom groups the existing screens; it relocates and duplicates nothing.')
