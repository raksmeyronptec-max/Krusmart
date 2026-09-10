import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { classIdFromSearchParams, resolveServerScope } from '@/lib/utils/serverScope'
import {
  buildClassList,
  type ClassAssignmentRow,
  type EnrolmentCountRow,
} from '@/lib/classroom/classes'
import { logger } from '@/lib/utils/logger'
import { buildGradeOffer, type GradeOption } from '@/lib/classroom/grades'
import ClassroomClient from './ClassroomClient'

export const metadata = { title: 'ថ្នាក់ និងសិស្ស' }

/**
 * ថ្នាក់ និងសិស្ស — the teacher's classes, and everything reached through one.
 *
 * ── Why this page absorbed `/classroom/classes` ────────────────────────────
 *
 * `/classroom` used to be four link cards: ថ្នាក់របស់ខ្ញុំ, សិស្សក្នុងថ្នាក់,
 * បញ្ចូលសិស្សថ្មី, មុខវិជ្ជា. Creating and managing classes worked perfectly well one
 * click further in, and no teacher could tell — the front door to class
 * management never mentioned a class. A menu whose first item is the page you
 * were looking for is not information architecture, it is a detour.
 *
 * So the class list *is* this page, and the other three cards became per-class
 * links on each card, where they carry `?class=` and mean something concrete.
 * `/classroom/classes` redirects here.
 *
 * ── THE HUB STILL GROUPS, IT STILL DOES NOT RELOCATE ───────────────────────
 *
 * `/student-list`, `/enrollment` and `/score/subjects` keep their URLs and are
 * *linked*, never reimplemented. `/score/subjects` in particular is the single
 * subject-configuration screen in the product — which is why `/score/template`
 * is already a redirect to it — and a second one here is how the two would
 * start disagreeing about a class's curriculum.
 *
 * ── Two queries, never one per card ────────────────────────────────────────
 *
 * Assignments come back with their class, grade, level and year embedded, and
 * the head counts come back in a single `in('class_id', …)` read grouped in
 * memory. A count query per card would be an N+1 that grows with the number of
 * classes this page exists to encourage.
 *
 * ── The roster rule ───────────────────────────────────────────────────────
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
/**
 * The school whose grades and years the create dialog should offer, or `null`.
 *
 * Three sources, in the order the database will actually accept them —
 * `is_school_teacher()` (00031) admits the first two and refuses the third, so
 * asking in this order means the dialog is offered to the teachers who can use
 * it and, in the ordinary case, never to someone whose write will be refused:
 *
 *   1. a `user_roles` grant — the self-serve owner (00017) and the approved
 *      joiner (00022), both written by an RPC rather than by the caller;
 *   2. an active assignment — the teacher an administrator gave a class to and
 *      nothing else (`assignTeacher` writes no role row);
 *   3. `profiles.school_id`, LAST and deliberately, because
 *      `profiles_update_own` (00002) lets any user write their own. It is a
 *      home-school hint, not a membership record — good enough to decide which
 *      school's grades to *show*, never good enough to authorise a write. A
 *      caller whose only claim is this gets the dialog and a clear Khmer
 *      refusal from the server, which is the same answer /admin gives them.
 *
 * RLS keeps every read here to the caller's own rows.
 */
async function resolveSchoolId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('school_id')
    .eq('user_id', userId)
    .not('school_id', 'is', null)
    .limit(1)

  const fromRole = roleRows?.[0]?.school_id
  if (typeof fromRole === 'string') return fromRole

  const { data: assignmentRows } = await supabase
    .from('teacher_assignments')
    .select('academic_years!inner(school_id)')
    .eq('teacher_id', userId)
    .eq('status', 'active')
    .limit(1)

  const yearRel = (assignmentRows?.[0] as
    { academic_years?: { school_id?: string } | { school_id?: string }[] } | undefined)?.academic_years
  const fromAssignment = (Array.isArray(yearRel) ? yearRel[0] : yearRel)?.school_id
  if (typeof fromAssignment === 'string') return fromAssignment

  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', userId)
    .maybeSingle()

  return typeof profile?.school_id === 'string' ? profile.school_id : null
}

export default async function ClassroomPage({
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

  if (error) logger.error('classroom assignments:', error)

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
    if (enrolErr) logger.error('classroom enrolments:', enrolErr)
    enrolments = (enrolRows ?? []) as EnrolmentCountRow[]
  }

  const classes = buildClassList(assignments, enrolments)

  /*
   * What the create dialog needs to offer, resolved here rather than in the
   * client: the grades this teacher's school actually defines, and its academic
   * years. `createClassAndAssign` re-derives both server-side and refuses
   * anything the school does not hold, so this list is a convenience, never the
   * authorisation.
   *
   * ── The profile is the last answer, not the only one ─────────────────────
   *
   * This read used to be `profiles.school_id` alone. `create_teacher_organisation`
   * (00017) stamps it, so an owner always has one — but a teacher who *joined*
   * a school may not: 00022's `approve_join_request` runs
   * `UPDATE profiles ... WHERE id = <them> AND school_id IS NULL`, and nothing
   * in this product ever creates a `profiles` row for an ordinary signup, so
   * for them that UPDATE matches nothing and quietly writes no school. The
   * result was no grades, no years and no create dialog at all — for exactly
   * the teachers 00031 exists to let create a class.
   *
   * A teacher with none of the three sources genuinely has no organisation yet
   * — the dialog stays hidden and the empty state points at the step that is
   * actually missing.
   */
  const schoolId = await resolveSchoolId(supabase, user.id)

  let grades: GradeOption[] = []
  let years: { id: string; name: string }[] = []

  if (schoolId) {
    /*
     * Levels are read alongside the grades, and that is the fix for a real
     * dead end: the dialog used to offer only the `grades` rows that existed,
     * so a school holding one row could create classes in one grade and had no
     * control anywhere to add another. `buildGradeOffer` derives the offer from
     * each level's curriculum range instead — six grades for បឋមសិក្សា — and
     * `ensureGrade` writes the row when a class is actually put in one.
     */
    const [{ data: levelRows }, { data: gradeRows }, { data: yearRows }] = await Promise.all([
      supabase
        .from('education_levels')
        .select('id, name')
        .eq('school_id', schoolId)
        .order('sort_order'),
      supabase
        .from('grades')
        .select('id, name, sort_order, education_level_id, education_levels!inner(school_id)')
        .eq('education_levels.school_id', schoolId)
        .order('sort_order'),
      supabase
        .from('academic_years')
        .select('id, name, is_active')
        .eq('school_id', schoolId)
        .order('name', { ascending: false }),
    ])

    grades = buildGradeOffer(
      (levelRows ?? []).map((l) => ({ id: l.id as string, name: (l.name as string) ?? '' })),
      (gradeRows ?? []).map((g) => ({
        id: g.id as string,
        name: g.name as string,
        sort_order: (g.sort_order as number | null) ?? null,
        education_level_id: g.education_level_id as string,
      })),
    )

    years = (yearRows ?? []).map((y) => ({ id: y.id as string, name: y.name as string }))
    // The school's current year leads, so the dialog opens on it.
    const activeYear = yearRows?.find((y) => y.is_active)
    if (activeYear) {
      years = [
        { id: activeYear.id as string, name: activeYear.name as string },
        ...years.filter((y) => y.id !== activeYear.id),
      ]
    }
  }

  // Which class the rest of the app currently considers active. Resolved
  // through the same function every other server surface uses, so this screen
  // cannot show a different answer from the one `/score/enter` acts on.
  const scope = await resolveServerScope(user.id, requestedClassId)

  return (
    <ClassroomClient
      classes={classes}
      activeClassId={scope.mode === 'v2' ? scope.classId : null}
      loadFailed={Boolean(error)}
      grades={grades}
      years={years}
    />
  )
}
