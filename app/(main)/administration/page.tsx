import { redirect } from 'next/navigation'
import { resolveActor } from '@/lib/rbac/actor'

/**
 * `/administration` — the principal's school-wide view.
 *
 * ── What was here, and why it is gone ─────────────────────────────────────
 *
 * A 340-line screen rendering `MOCK_SCHOOL_STATS`, `MOCK_TEACHERS` and
 * `MOCK_TEACHER_DETAIL`: an invented school of 1,250 pupils at 95.5%
 * attendance, three named teachers, and a per-teacher radar chart scoring each
 * of them on សិស្សពូកែ and ជួយសិស្សខ្សោយ. Phase 0 recorded it as P0-3 — a
 * principal was offered a school-analytics dashboard indistinguishable from a
 * true one — and Phase 1 hid the row from navigation, which stopped it being
 * *offered* without stopping it being *reachable*.
 *
 * Wiring it up was left to this phase, and inspecting the data settled it the
 * other way. Of the six headline figures, `app/admin/queries.ts` can compute
 * two. `passRate` would need every pupil's annual result across the school;
 * `dropoutRisk` has no definition anywhere in this product; and the radar's two
 * teacher-effectiveness axes are metrics nobody has specified. Manufacturing
 * definitions for them here is exactly what §35 forbids — the UI must not
 * become the business-logic layer — and wiring half while inventing the rest
 * would leave a screen that is true in places, which is worse than one that is
 * plainly a mock.
 *
 * ── Why a redirect rather than a rewrite ──────────────────────────────────
 *
 * `/admin/dashboard` is already the real version: the same six school-wide
 * counters computed from the administrator's own school, plus the audit feed,
 * behind the console's own role gate. Two school-analytics screens in two route
 * trees is the second mental model the brief's §18 warns about, and rebuilding
 * this one would have created it deliberately.
 *
 * So this follows `/score/template` → `/score/subjects` and
 * `/classroom/classes` → `/classroom`: the URL keeps working, nothing that
 * links here breaks, the row stays declared `hidden` in `lib/navigation.ts` so
 * `moduleForPath` still resolves a breadcrumb mid-redirect, and there is one
 * school overview instead of two.
 *
 * The actor check stays and runs FIRST. `/admin`'s layout would redirect a
 * non-administrator to `/dashboard` anyway, but bouncing a parent through the
 * admin tree to find that out is a worse answer than refusing here.
 */
export default async function AdministrationPage() {
  const actor = await resolveActor()

  if (!actor) redirect('/login')
  if (actor.kind === 'parent') redirect('/parent/dashboard')
  if (actor.kind !== 'admin') redirect('/dashboard')

  redirect('/admin/dashboard')
}
