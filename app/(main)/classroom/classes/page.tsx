import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { classIdFromSearchParams, resolveServerScope } from '@/lib/utils/serverScope'
import {
  buildClassList,
  type ClassAssignmentRow,
  type EnrolmentCountRow,
} from '@/lib/classroom/classes'
import { logger } from '@/lib/utils/logger'
import ClassesClient from './ClassesClient'

export const metadata = { title: 'ថ្នាក់របស់ខ្ញុំ' }

/**
 * ថ្នាក់របស់ខ្ញុំ — the class-management screen the product did not have.
 *
 * A teacher could create a class in exactly two places: `/onboarding/class`,
 * which runs once (`onboardingRedirect` returns null the moment they have a
 * class), and `/admin/classes`, which needs a principal. A teacher who wanted a
 * second class had nowhere to go. This is that place, and it is the ongoing
 * entry point — a teacher with no class lands on the empty state here rather
 * than being pushed back into the one-time wizard.
 *
 * ── Two queries, never one per card (§26) ──────────────────────────────────
 *
 * Assignments come back with their class, grade, level and year embedded, and
 * the head counts come back in a single `in('class_id', …)` read that is
 * grouped in memory. A count query per card would be an N+1 that grows with the
 * number of classes this page exists to encourage.
 *
 * ── The roster rule (§10) ──────────────────────────────────────────────────
 *
 * Counts exclude `withdrawn` and nothing else. Filtering on `status = 'active'`
 * instead would show every past year's class as empty, because those enrolments
 * are stamped `promoted` or `transferred` — the same reason
 * `fetchStudentsForScope` uses `.neq`. The card's number has to mean what
 * `/student-list` will show.
 *
 * RLS is the boundary, as everywhere: the `teacher_id` filter is this project's
 * usual second guard, and a class the caller may not read simply does not come
 * back.
 */
export default async function ClassesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const requestedClassId = await classIdFromSearchParams(searchParams)

  // Written as one literal, not a concatenation: supabase-js parses the select
  // string at the type level and loses the embedded relations if it is built.
  const { data: rows, error } = await supabase
    .from('teacher_assignments')
    .select(
      'id, class_id, academic_year_id, is_homeroom, subject_key, status, created_at, classes(id, name, track, grades(name, sort_order, education_levels(name))), academic_years(name)',
    )
    .eq('teacher_id', user.id)
    .eq('status', 'active')

  if (error) logger.error('classroom/classes assignments:', error)

  const assignments = (rows ?? []) as unknown as ClassAssignmentRow[]
  const classIds = [...new Set(assignments.map((a) => a.class_id))]

  // One read for every card's head count.
  let enrolments: EnrolmentCountRow[] = []
  if (classIds.length > 0) {
    const { data: enrolRows, error: enrolErr } = await supabase
      .from('student_enrollments')
      .select('class_id, student_id, status')
      .in('class_id', classIds)
      .neq('status', 'withdrawn')
    if (enrolErr) logger.error('classroom/classes enrolments:', enrolErr)
    enrolments = (enrolRows ?? []) as EnrolmentCountRow[]
  }

  const classes = buildClassList(assignments, enrolments)

  // Which class the rest of the app currently considers active. Resolved
  // through the same function every other server surface uses, so this screen
  // cannot show a different answer from the one `/score/enter` acts on.
  const scope = await resolveServerScope(user.id, requestedClassId)

  return (
    <ClassesClient
      classes={classes}
      activeClassId={scope.mode === 'v2' ? scope.classId : null}
      loadFailed={Boolean(error)}
    />
  )
}
