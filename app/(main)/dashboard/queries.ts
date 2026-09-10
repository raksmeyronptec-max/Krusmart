import 'server-only'

import { createClient } from '@/lib/supabase/server'
import {
  classIdFromSearchParams,
  fetchScoreCalendar,
  resolveClassTemplateContext,
  resolveServerGradingContext,
  fetchStudentsForScope,
  resolveServerScope,
  rosterIdsForScope,
} from '@/lib/utils/serverScope'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import { simpleAverage, type GradingSchemeConfig } from '@/lib/grading/scheme'
import {
  monthIdFromPeriod, monthlyAveragesByStudent, type MonthlyMark,
} from '@/lib/scores/aggregate'
import { completionSummary, subjectProgress, type CompletionSummary } from '@/lib/scores/completion'
import { periodForDate } from '@/lib/scores/calendar'
import { scoreNumericValue } from '@/lib/utils/score-value'
import { logger } from '@/lib/utils/logger'
import { tallyAttendance } from '@/lib/attendance/status'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { levelByKey } from '@/lib/onboarding/curriculum'
import type { AttendanceRecord, HomeworkAssignment, Score } from '@/lib/types'

/**
 * What the dashboard needs to answer four questions:
 *
 *   What is happening today?      today's attendance
 *   What needs my attention?      absences, unmarked days, overdue homework
 *   How is my class performing?   the month's average and its grade
 *   What should I do next?        the quick actions the page offers
 *
 * Everything is derived from the existing tables through the existing scope
 * helpers — no new columns, no schema change, and the same `teacher_id` /
 * roster narrowing every other feature already applies on top of RLS.
 */

export interface DashboardStats {
  totalStudents: number
  female: number
  /** Null when nobody has been marked today — "not taken" is not "zero present". */
  todayPresent: number | null
  todayAbsent: number
  /** Absent WITH permission — ច្បាប់. Was `todayLate`, which this app never records. */
  todayExcused: number
  attendanceRate: number | null
  monthAverage: number | null
  /**
   * The period `monthAverage` and `completion` describe — the class's *current*
   * one, on its own calendar. Null when the calendar cannot place today, which
   * is possible for a school whose configured periods do not span the date.
   */
  periodLabel: string | null
  /** How far through this period's marking the class is. */
  completion: CompletionSummary
  /** The class's grading scheme — the page grades and labels with it. */
  scheme?: GradingSchemeConfig
  /** Students whose monthly average is below the scheme's pass mark. */
  strugglingCount: number
  openHomework: number
  academicYear: string
  /**
   * The class every figure above was computed for, and the class every link on
   * the page must carry. Null for a pre-V2 account, which is scoped by
   * `teacher_id` and has no class row to name.
   *
   * Returned rather than re-resolved in the page: `resolveServerScope` already
   * ran here, and a second call could in principle answer differently (a
   * `?class=` the caller does not hold falls back to their default). One
   * resolution, one answer — the dashboard's heading and its links cannot
   * disagree with its numbers.
   */
  classId: string | null
  className: string
  /** ថ្នាក់ទី៥ · បឋមសិក្សា, when the class's grade and level resolve. */
  classContext: string
}

/** One line of "what did I last do", already phrased for the teacher. */
export interface ActivityItem {
  id: string
  label: string
  /** ISO timestamp — formatted in the component, which knows the locale. */
  at: string
}

export interface AttentionItem {
  id: string
  severity: 'danger' | 'warning' | 'info'
  label: string
  href: string
}

function todayISO(): string {
  // The teacher's own day, not UTC — a 7am mark in Phnom Penh must not read as
  // yesterday.
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export async function getDashboardData(
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
): Promise<{ stats: DashboardStats; attention: AttentionItem[]; activity: ActivityItem[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const academicYear = getCurrentAcademicYear()
  const empty: DashboardStats = {
    totalStudents: 0, female: 0, todayPresent: null, todayAbsent: 0, todayExcused: 0,
    attendanceRate: null, monthAverage: null, periodLabel: null,
    completion: { subjects: 0, complete: 0, partial: 0, empty: 0, percent: 0 },
    strugglingCount: 0, openHomework: 0, academicYear,
    classId: null, className: '', classContext: '',
  }
  if (!user) return { stats: empty, attention: [], activity: [] }

  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  // One grading resolution for the whole page, in parallel with the roster.
  const [students, rosterIds, grading, calendar] = await Promise.all([
    fetchStudentsForScope(scope),
    rosterIdsForScope(scope),
    resolveServerGradingContext(user.id, requestedClassId),
    // The class's own periods (00029), so "this month" means what the class
    // says it means — a school that grades មីនា–មេសា as one period gets one.
    fetchScoreCalendar(scope, academicYear),
  ])
  const ids = rosterIds ?? students.map((s) => s.id)

  const today = todayISO()

  // An empty roster would make `.in()` match nothing, so skip those round trips
  // entirely rather than firing queries that cannot return anything.
  const [attendanceRes, scoresRes, homeworkRes] = await Promise.all([
    ids.length
      ? supabase.from('attendance').select('student_id, status, date').eq('date', today).in('student_id', ids)
      : Promise.resolve({ data: [] as AttendanceRecord[], error: null }),
    ids.length
      ? supabase.from('scores').select('student_id, score_value, score_text, subject, score_period')
          .eq('score_type', 'monthly').like('score_period', `%${academicYear}`).in('student_id', ids)
      : Promise.resolve({ data: [] as Score[], error: null }),
    supabase.from('homework_assignments').select('id, due_date, status').eq('teacher_id', user.id),
  ])

  // Independent of everything above and cheap, so it rides along rather than
  // adding a waterfall. Six lines: enough to say what happened, short enough
  // that it never competes with the tasks above it.
  const activity = await recentActivity(user.id, 6)

  if (attendanceRes.error) logger.error(attendanceRes.error)
  if (scoresRes.error) logger.error(scoresRes.error)

  const attendance = (attendanceRes.data ?? []) as AttendanceRecord[]
  const scores = (scoresRes.data ?? []) as Score[]
  const homework = (homeworkRes.data ?? []) as HomeworkAssignment[]

  /*
   * Today's register, counted by the shared vocabulary.
   *
   * This used to filter for `'P'`, `'L'` and `'A'` by hand — dropping `AP`
   * entirely, calling `L` "late", and then adding it to the numerator under a
   * comment saying the parent portal did the same. It did, and both were wrong:
   * `L` is ច្បាប់, an absence the school permitted. See
   * `lib/attendance/status.ts`.
   */
  const tally = tallyAttendance(attendance)
  const marked = tally.marked
  const todayPresent = marked ? tally.present : null
  const todayExcused = tally.excused
  const todayAbsent = tally.unexcused
  const attendanceRate = tally.rate

  // Per student first, then across students: averaging every raw mark would let
  // a pupil with more subjects recorded weigh more than one with fewer.
  //
  // The grading context is resolved once for the whole page (above) and reused
  // for every pupil — the calculation is pure, so a class of forty costs one
  // resolution, not forty.
  /*
   * ── The tile says "ប្រចាំខែ" and now actually means one month ────────────
   *
   * This read fetches the whole academic year (`like '%<year>'`) and the old
   * derivation folded every row of it into one bucket per pupil keyed by
   * `subject` — so November's Khmer mark was overwritten by December's, by
   * January's, in whatever order Postgres happened to return them. The query
   * carries no ORDER BY, so the figure under "មធ្យមភាគប្រចាំខែ" was a mixture of
   * months that could change between two refreshes with no data changing, and
   * `strugglingCount` — which drives the attention list — inherited it.
   *
   * The year-wide read stays: it is one round trip and the current period is a
   * filter over it, not a second query. What changed is that the rows are now
   * bucketed BY MONTH first, through the same `monthlyAveragesByStudent` that
   * `/score/total` and `/ranking` compose their semesters from, and only the
   * current period's months are read out. So the dashboard's monthly figure is
   * the score table's monthly figure for the same class and month, by
   * construction rather than by coincidence.
   */
  const currentPeriod = periodForDate(calendar, new Date())

  const monthlyMarks: MonthlyMark[] = []
  for (const row of scores) {
    const v = scoreNumericValue(row)
    if (v === null) continue
    const monthId = monthIdFromPeriod(row.score_period, academicYear)
    if (monthId === null) continue
    monthlyMarks.push({
      studentId: row.student_id,
      monthId,
      score: v,
      maxScore: grading.maxByColumn[row.subject] ?? grading.scheme.maxScore,
    })
  }
  const byMonth = monthlyAveragesByStudent(monthlyMarks, grading.scheme)

  // Every month the current period covers — one for an ordinary month, two for
  // a merged មីនា-មេសា. A pupil marked in neither is absent, not zero.
  const periodMonths = currentPeriod?.members ?? []
  const studentAverages = ids
    .map((id) => {
      const values = periodMonths
        .map((m) => byMonth[id]?.[m])
        .filter((v): v is number => typeof v === 'number')
      return values.length === 0 ? null : simpleAverage(values)
    })
    .filter((v): v is number => v !== null)

  const monthAverage = simpleAverage(studentAverages)
  const strugglingCount = studentAverages.filter((v) => v < grading.scheme.passMark).length

  /*
   * How far through this period's marking the class is.
   *
   * `subjectProgress` is the same function `/score/collect` counts with, over
   * the same resolved subject list, so the bar here and that screen's rows
   * cannot report different progress. The rows are narrowed to the current
   * period from the year-wide read already in hand — no extra round trip.
   */
  const periodRows = scores.filter((r) => {
    const monthId = monthIdFromPeriod(r.score_period, academicYear)
    return monthId !== null && periodMonths.includes(monthId as typeof periodMonths[number])
  })
  const completion = completionSummary(
    /*
     * `taughtSubjects`, not `subjects`: this is the progress bar, and progress
     * is measured against the work a teacher can actually do. Counted over the
     * whole template it told a class teaching three subjects that thirty-two
     * more were outstanding and pinned the bar at ៩% for ever, while the
     * attention list said "៣៥ មុខវិជ្ជា មិនទាន់បញ្ចូលពិន្ទុគ្រប់".
     * The averages above still read the unnarrowed `subjects`.
     */
    subjectProgress(grading.taughtSubjects, periodRows, ids.length),
  )

  /*
   * The class's own name, for the heading and for every link on the page.
   *
   * One extra read, and only in v2: a pre-V2 account has no `classes` row at
   * all. `resolveClassTemplateContext` is the same helper the Print Center's
   * context bar uses, so the two surfaces name a class identically rather than
   * each formatting it their own way.
   */
  let className = ''
  let classContext = ''
  if (scope.mode === 'v2') {
    const [{ data: classRow }, templateContext] = await Promise.all([
      supabase.from('classes').select('name').eq('id', scope.classId).maybeSingle(),
      resolveClassTemplateContext(scope.classId),
    ])
    className = (classRow?.name as string | undefined) ?? ''
    const level = templateContext?.levelKey ? levelByKey(templateContext.levelKey) : null
    classContext = [
      templateContext?.gradeNumber ? `ថ្នាក់ទី${toKhmerNumber(templateContext.gradeNumber)}` : '',
      level?.name ?? '',
    ].filter(Boolean).join(' · ')
  } else {
    // A pre-V2 account still prints a class name on every sheet — it lives in
    // `settings`, not in a `classes` row. Same fallback the Print Center makes,
    // and for the same reason: the header names the class, it does not expose
    // which scoping path resolved it.
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('class_name')
      .eq('teacher_id', user.id)
      .maybeSingle()
    className = (settingsRow?.class_name as string | undefined) ?? ''
  }

  const female = students.filter((s) => s.gender === 'ស្រី' || s.gender === 'Female').length
  const openHomework = homework.filter((h) => h.status !== 'closed').length

  const attention: AttentionItem[] = []
  if (students.length > 0 && marked === 0) {
    attention.push({
      id: 'no-attendance',
      severity: 'warning',
      label: 'មិនទាន់បានចុះវត្តមានសម្រាប់ថ្ងៃនេះទេ',
      href: '/attendance/layout',
    })
  }
  if (todayAbsent > 0) {
    attention.push({
      id: 'absent',
      severity: 'danger',
      label: `សិស្ស ${toKhmerNumber(todayAbsent)} នាក់អវត្តមានថ្ងៃនេះ`,
      href: '/attendance/monthly',
    })
  }
  if (strugglingCount > 0) {
    attention.push({
      id: 'struggling',
      severity: 'warning',
      // The pass mark is the class's own scheme's, not a literal ៥: a
      // secondary class marks out of 50 and passes at 25, so the hard-coded
      // five described the *primary* rule on every screen that showed it.
      label: `សិស្ស ${toKhmerNumber(strugglingCount)} នាក់មានមធ្យមភាគក្រោម ${toKhmerNumber(grading.scheme.passMark)}`,
      href: '/ranking',
    })
  }
  /*
   * The marking still outstanding for this period.
   *
   * Counted from `completion`, which is `subjectProgress`' answer — so this
   * line and `/score/collect`'s rows cannot disagree about what is missing.
   * Only raised when the class has actually started: a class with nothing
   * entered anywhere is a class that has not begun the month, which the
   * completion bar already says, and repeating it as a task would make the
   * first day of every period open with a warning.
   */
  if (completion.subjects > 0 && completion.percent > 0 && completion.percent < 100) {
    const outstanding = completion.partial + completion.empty
    attention.push({
      id: 'marking-outstanding',
      severity: 'info',
      label: `មុខវិជ្ជា ${toKhmerNumber(outstanding)} មិនទាន់បញ្ចូលពិន្ទុគ្រប់`,
      href: '/score/collect',
    })
  }
  if (students.length === 0) {
    attention.push({
      id: 'no-students',
      severity: 'info',
      label: 'មិនទាន់មានសិស្សក្នុងបញ្ជី — បន្ថែមសិស្សដើម្បីចាប់ផ្តើម',
      href: '/enrollment',
    })
  }

  return {
    stats: {
      totalStudents: students.length,
      female,
      todayPresent,
      todayAbsent,
      todayExcused,
      attendanceRate,
      monthAverage,
      periodLabel: currentPeriod?.labelKm ?? null,
      completion,
      scheme: grading.scheme,
      strugglingCount,
      openHomework,
      academicYear,
      classId: scope.mode === 'v2' ? scope.classId : null,
      className,
      classContext,
    },
    attention,
    activity,
  }
}

/**
 * ACTIVITY VOCABULARY — an audit action, said in Khmer.
 *
 * `audit_logs.action` is `<entity>.<verb>` and is *schema*: it is written by
 * every mutating action in the app and read by `/admin/audit-logs`. It is not a
 * sentence, so this maps the actions a teacher actually generates into one.
 *
 * ── Written against what the code really writes ───────────────────────────
 *
 * Every key here was taken from an `auditLog`/`auditLogBatch` call site, not
 * guessed from the `AuditAction` union — that union ends in `(string & {})`,
 * so it accepts anything and documents nothing. Actions belonging to the admin
 * console (`academic_year.*`, `subject.created`, `grade.created`,
 * `join_request.*`) are deliberately absent: this feed is on the teacher's
 * dashboard and reports what *they* did in their class.
 *
 * An unmapped action is **skipped, not shown raw**: `score.updated` is a line a
 * teacher understands and `class_template.selection_applied` written out as
 * itself is not, and a feed that occasionally prints database identifiers reads
 * as a leak rather than as a history. New actions therefore appear here
 * deliberately or not at all.
 *
 * `n` is the number of things affected — see `recentActivity` for where it
 * comes from, which is not simply the number of rows.
 */
const ACTIVITY_LABEL: Record<string, (n: number) => string> = {
  // marks
  'score.updated': (n) => `បានរក្សាទុកពិន្ទុ ${toKhmerNumber(n)} ប្រអប់`,
  'score.deleted': (n) => `បានលុបពិន្ទុរបស់សិស្ស ${toKhmerNumber(n)} នាក់`,
  'cognitive.updated': () => 'បានកែការវាយតម្លៃសមត្ថភាព',
  // attendance
  'attendance.updated': (n) => `បានចុះវត្តមានសិស្ស ${toKhmerNumber(n)} នាក់`,
  // pupils
  'student.created': () => 'បានបញ្ចូលសិស្សថ្មី',
  'student.deleted': (n) => `បានលុបសិស្ស ${toKhmerNumber(n)} នាក់`,
  'student.imported': (n) => `បាននាំចូលសិស្ស ${toKhmerNumber(n)} នាក់`,
  'student.reordered': () => 'បានរៀបលំដាប់បញ្ជីសិស្ស',
  'enrollment.backfilled': (n) => `បានចុះឈ្មោះសិស្ស ${toKhmerNumber(n)} នាក់ចូលថ្នាក់`,
  'enrollment.bulk_promoted': (n) => `បានឡើងថ្នាក់សិស្ស ${toKhmerNumber(n)} នាក់`,
  'enrollment.withdrawn': () => 'បានដកឈ្មោះសិស្ស',
  // the class
  'class.created': () => 'បានបង្កើតថ្នាក់ថ្មី',
  'class.updated': () => 'បានកែឈ្មោះថ្នាក់',
  'class.archived': () => 'បានទុកថ្នាក់ក្នុងប័ណ្ណសារ',
  // curriculum
  'class_template.subjects_added': (n) => `បានបន្ថែមមុខវិជ្ជា ${toKhmerNumber(n)}`,
  'class_template.subject_removed': () => 'បានដកមុខវិជ្ជាចេញពីថ្នាក់',
  'class_template.selection_applied': () => 'បានកែបញ្ជីមុខវិជ្ជារបស់ថ្នាក់',
  'class_template.components_updated': () => 'បានកែសមាសភាគមុខវិជ្ជា',
  'score_template.created': () => 'បានបង្កើតមុខវិជ្ជាផ្ទាល់ខ្លួន',
  'score_template.reverted': () => 'បានត្រឡប់មុខវិជ្ជាទៅដើមវិញ',
  'score_template.reset': () => 'បានកំណត់បញ្ជីមុខវិជ្ជាឡើងវិញ',
  'score_calendar.updated': () => 'បានកែវគ្គបញ្ចូលពិន្ទុ',
  'score_calendar.reset': () => 'បានកំណត់វគ្គបញ្ចូលពិន្ទុឡើងវិញ',
  // paperwork
  'report.generated': (n) => `បានបង្កើតរបាយការណ៍ ${toKhmerNumber(n)}`,
  'class_admin.created': () => 'បានបញ្ចូលកំណត់ត្រារដ្ឋបាលថ្នាក់',
  'class_admin.updated': () => 'បានកែកំណត់ត្រារដ្ឋបាលថ្នាក់',
  'class_admin.deleted': () => 'បានលុបកំណត់ត្រារដ្ឋបាលថ្នាក់',
  // homework and messages
  'homework.created': () => 'បានបង្កើតកិច្ចការផ្ទះ',
  'homework.deleted': () => 'បានលុបកិច្ចការផ្ទះ',
  'notification.created': () => 'បានផ្ញើសារទៅអាណាព្យាបាល',
  'notification.deleted': () => 'បានលុបសារ',
  // the account
  'profile.section_saved.personal': () => 'បានកែព័ត៌មានផ្ទាល់ខ្លួន',
  'profile.section_saved.school': () => 'បានកែព័ត៌មានសាលា',
  'profile.section_saved.work': () => 'បានកែព័ត៌មានការងារ',
  'profile.password_changed': () => 'បានប្តូរពាក្យសម្ងាត់',
  'organisation.created': () => 'បានបង្កើតស្ថាប័ន',
  'education_level.created': () => 'បានបន្ថែមកម្រិតសិក្សា',
}

/**
 * How many raw rows to scan before folding.
 *
 * Generous, because folding collapses runs: a teacher who saved the same month
 * eight times produces eight rows that become one line, so the scan has to
 * reach past them to find the genuinely different action underneath.
 */
const ACTIVITY_SCAN = 200

/**
 * What this teacher last did, newest first.
 *
 * ── Where the number comes from ───────────────────────────────────────────
 *
 * `auditLogBatch` writes **one** row carrying `metadata.count`, not one row per
 * affected thing — saving a month of marks for forty pupils is a single
 * `score.updated` row with `count: 40`. So the figure in the sentence is that
 * metadata, not the number of rows: counting rows would report "បានរក្សាទុកពិន្ទុ
 * ១ ប្រអប់" for a class of forty. A row written by plain `auditLog` carries no
 * count and stands for one thing, which is what the fallback of 1 means.
 *
 * Consecutive rows sharing an action are still folded — a teacher who saved the
 * same grid eight times produces eight rows, and eight lines saying the same
 * thing push yesterday's genuinely different action off the screen. Their
 * counts are summed and the newest timestamp kept, which is what "when did I
 * last do this, and how much of it" means.
 *
 * ── Why it can be read at all ─────────────────────────────────────────────
 *
 * Migration 00030. Until it, `audit_logs` had a single SELECT policy gated on
 * `is_school_admin`, so a teacher wrote to the trail on every save and could
 * read none of it — verified against the local stack: this teacher saw 0 rows
 * before the policy and 23 after, and none of the other teacher's 12.
 *
 * `.eq('actor_id', user.id)` as well, even though the policy enforces it — the
 * second-guard convention this codebase applies to every scoped read, and here
 * it also picks 00003's `(actor_id, created_at DESC)` index rather than leaving
 * the planner to filter a school's whole history.
 *
 * Never throws: a dashboard must not fail because its least important section
 * could not load. An error yields an empty feed, which renders as nothing.
 */
async function recentActivity(userId: string, limit: number): Promise<ActivityItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, created_at, metadata')
    .eq('actor_id', userId)
    .order('created_at', { ascending: false })
    .limit(ACTIVITY_SCAN)

  if (error) {
    logger.error('dashboard activity:', error)
    return []
  }

  const rows = (data ?? []) as {
    id: string
    action: string
    created_at: string
    metadata: Record<string, unknown> | null
  }[]

  /** `metadata.count` when the row carries one, else this row stands for one thing. */
  const countOf = (row: { metadata: Record<string, unknown> | null }): number => {
    const raw = row.metadata?.count
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 1
  }

  const out: ActivityItem[] = []
  let run: { id: string; action: string; at: string; count: number } | null = null

  const flush = () => {
    if (!run) return
    const label = ACTIVITY_LABEL[run.action]
    // Unmapped actions are dropped rather than printed raw — see the note above.
    if (label) out.push({ id: run.id, label: label(run.count), at: run.at })
    run = null
  }

  for (const row of rows) {
    if (out.length >= limit) break
    if (run && run.action === row.action) {
      run.count += countOf(row)
      continue
    }
    flush()
    run = { id: row.id, action: row.action, at: row.created_at, count: countOf(row) }
  }
  flush()

  return out.slice(0, limit)
}
