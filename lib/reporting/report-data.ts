import 'server-only'

import { createClient } from '@/lib/supabase/server'
import {
  fetchClassSelection,
  fetchScoreCalendar,
  fetchScoreTemplate,
  fetchStudentsForScope,
  resolveServerScope,
  rosterIdsForScope,
} from '@/lib/utils/serverScope'
import type { QueryScope } from '@/lib/utils/queryFilter'
import { periodKeysForSemester } from '@/lib/scores/calendar'
import { resolveTemplate } from '@/lib/scores/template'
import { applySelection } from '@/lib/scores/selection'
import { assignRanks, numericColumnKeys, studentAverage } from '@/lib/scores/aggregate'
import { schemeForLevel } from '@/lib/grading/levelSchemes'
import { gradeFor } from '@/lib/grading/scheme'
import { scoreCellValue } from '@/lib/utils/score-value'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { MONTH_LABEL_BY_ID } from '@/lib/constants/months'
import {
  isSemesterId, monthlyComponent, semesterAverage, semesterLabel,
  type SemesterId,
} from '@/lib/scores/semester'
import {
  defaultHonorCriteria, evaluateHonor, HONOR_CRITERIA_PROVENANCE,
} from '@/lib/scores/honor'
import {
  annualSourceNote, annualStatusLabel, buildAnnualResult, promotionThreshold,
  SEM1_KEY, SEM2_KEY, storedAnnualValue,
  type AnnualResult, type AnnualStatus, type AnnualValueSource,
} from '@/lib/scores/annual'
import { MONTH_NUM_BY_ID } from '@/lib/constants/months'
import type { MonthId } from '@/lib/constants/months'
import {
  isFemale, schemeLetters, tallyCell, tallySubject,
} from '@/lib/scores/subject-results'
import { logger } from '@/lib/utils/logger'
import type { Score, Settings, Student } from '@/lib/types'
import type { CellValue, ReportPayload, ReportRow, ReportSubjectColumn } from './report-mapper'
import type { ReportType } from './report-types'

/**
 * Turning the database into a report payload.
 *
 * The one rule that makes this layer safe (§23): **the report layer is not a
 * source of truth.** It reads the same score template, the same class selection
 * and the same grading scheme the score screens read, through the same
 * `serverScope` helpers, and computes averages with the same `studentAverage`.
 * A number on a printed sheet that disagrees with the number on `/score/total`
 * would be the worst possible defect here, so there is no second calculation to
 * disagree with.
 *
 * Scoping is not re-implemented either (§18). `resolveServerScope` validates the
 * requested class against the caller's own assignments, so a forged `classId`
 * cannot widen access, and RLS refuses it independently at the database.
 */

/** What the caller asks for. `classId` is a request, never an authority. */
export interface ReportRequest {
  reportType: ReportType
  classId?: string
  academicYear: string
  /** `nov` for monthly, `sem1`/`sem2` for semester, the year itself otherwise. */
  period: string
  /**
   * Which pupils the document is for — the certificate's selection (§10).
   *
   * A REQUEST, never an authority, on exactly the same footing as `classId`.
   * Every id is intersected with the roster `resolveServerScope` already
   * validated, so an id belonging to another teacher's pupil is silently
   * dropped rather than fetched (§33). Omitted means "everyone the report's
   * own rule selects".
   */
  studentIds?: string[]
}

/** A payload plus the counts the preview screen shows before generating (§15). */
export interface ResolvedReport {
  payload: ReportPayload
  summary: {
    studentCount: number
    subjectCount: number
    /** Class mean across pupils who have marks, or `null` when none do. */
    average: number | null
    periodLabel: string
    className: string
    /** Honour only: how many pupils met the criteria (§14). */
    honorCount?: number
    /** Honour only: the rule, in Khmer. */
    criteriaLabel?: string
    /** Honour only: true while the rule is derived rather than official. */
    criteriaProvisional?: boolean
  }
}

/**
 * The four behavioural assessments the record book prints.
 *
 * Column ids, not subject keys, and they hold WORDS — rated from a dropdown and
 * stored in `score_text` (migration 00012), which is why no average ever
 * includes them and `resolveMonthlyClass` drops text-kind subjects from its
 * marks table. Listed here rather than derived because the MoEYS booklet's
 * section គ names these four specifically; a class that does not rate them
 * prints blanks, which is the honest result.
 */
const BEHAVIOUR_KEYS = [
  'sem_eval_knowledge', 'sem_eval_skill', 'sem_eval_moral', 'sem_eval_participate',
] as const

/** The `scores.score_period` a monthly report reads. */
function monthlyPeriod(month: string, academicYear: string): string {
  return `${month}-${academicYear}`
}

/**
 * `score_monthly` — the representative report (§20).
 *
 * Chosen to be first because it exercises every hard part at once: class
 * scoping, the active score template, a variable number of subject columns, one
 * row per pupil, per-subject marks, derived totals and ranks, and the school
 * header. A report that clears this needs no new machinery.
 */
/**
 * Everything a monthly class report needs, resolved once.
 *
 * Extracted so `score_monthly` and `ranking_monthly` cannot drift (§9). They
 * print very different documents — one is a marks grid in register order, the
 * other a league table in rank order — but they are the *same* class, the same
 * subjects, the same averages and the same ranks. Two resolvers each doing
 * their own arithmetic is precisely how a ranking sheet ends up disagreeing
 * with the score sheet it was derived from.
 *
 * Every calculation here is a call into the canonical domain helpers:
 * `resolveTemplate` + `applySelection` for the subject list, `numericColumnKeys`
 * for the denominator, `studentAverage` for the mean, `assignRanks` for the
 * order, `gradeFor` for the niddes. Nothing is reimplemented.
 */
export interface MonthlyClassData {
  students: { student: Student; scores: Record<string, number | string | null>
              average: number | null; total: number; scored: number; rank: number }[]
  subjects: ReportSubjectColumn[]
  scheme: ReturnType<typeof schemeForLevel>
  classAverage: number | null
  className: string
  gradeNumber: number | null
  settings: Settings
  monthLabel: string
  periodLabel: string
  /** Carried so a caller can run a second, related query without re-scoping. */
  rosterIds: string[] | null
  teacherId: string
  scope: QueryScope
  /** The numeric denominator this class's curriculum resolves to. */
  numericKeys: string[]
}

/**
 * Which marks to read. Defaults to the monthly period the request names; the
 * semester report overrides both so it can reuse every other step (§5).
 */
interface PeriodOptions {
  scoreType?: 'monthly' | 'semester'
  periodOverride?: string
}

async function resolveMonthlyClass(
  request: ReportRequest,
  options: PeriodOptions = {},
): Promise<MonthlyClassData | { error: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'សូមចូលគណនីជាមុនសិន' }

  // Validated against the caller's own assignments — a forged id cannot widen
  // access, and RLS refuses it again at the database (§20).
  const scope = await resolveServerScope(user.id, request.classId)

  const [students, { rows: templateRows, context }, selection, rosterIds] =
    await Promise.all([
      fetchStudentsForScope(scope),
      fetchScoreTemplate(scope),
      fetchClassSelection(scope),
      rosterIdsForScope(scope),
    ])

  // The class's subjects — its template narrowed by what it teaches (00028),
  // never a static list (§5). Not narrowed by role: a printed class document
  // carries the class's whole curriculum whoever generates it, matching
  // `/score/total`'s `classSubjects`.
  const effective = applySelection(
    resolveTemplate(templateRows, options.scoreType ?? 'monthly', context),
    selection,
  )
  const scheme = schemeForLevel(context?.levelKey ?? null)

  const subjects: ReportSubjectColumn[] = effective.flatMap((subject) =>
    subject.valueKind === 'text'
      ? [] // behavioural ratings are words; they never enter a marks table
      : subject.columns.map((column) => ({
          key: column.id,
          label: column.label,
          maxScore: subject.maxScore,
        })),
  )

  // ------------------------------------------------------------- the marks
  const scoreType = options.scoreType ?? 'monthly'
  const period = options.periodOverride ?? monthlyPeriod(request.period, request.academicYear)
  let query = supabase
    .from('scores')
    .select('student_id, subject, score_value, score_text')
    .eq('score_type', scoreType)
    .eq('score_period', period)

  // Same roster rule the score screens use: v2 reads by enrolment, legacy by
  // teacher_id. Never a third scoping path.
  query = rosterIds ? query.in('student_id', rosterIds) : query.eq('teacher_id', scope.teacherId)

  const { data: scoreRows, error } = await query
  if (error) {
    logger.error('resolveMonthlyClass:', error)
    return { error: 'ទាញយកពិន្ទុមិនបានសម្រេច' }
  }

  const byStudent = new Map<string, Record<string, number | string | null>>()
  for (const row of (scoreRows ?? []) as Score[]) {
    const bucket = byStudent.get(row.student_id) ?? {}
    bucket[row.subject] = scoreCellValue(row)
    byStudent.set(row.student_id, bucket)
  }

  // --------------------------------------------------------- the arithmetic
  const maxByColumn = Object.fromEntries(subjects.map((s) => [s.key, s.maxScore]))
  const keys = numericColumnKeys(effective)

  const computed = students.map((student) => {
    const scores = byStudent.get(student.id) ?? {}
    const result = studentAverage(scores, keys, maxByColumn, scheme)
    return { student, scores, ...result, rank: 0 }
  })

  // `assignRanks` sorts in place, so rank on a copy and leave `computed` in
  // roster order. Ties share a rank and the next rank skips (1,2,2,4) — the
  // project's existing semantics, preserved deliberately (§7).
  assignRanks([...computed], (r) => r.average ?? 0, (r, rank) => { r.rank = rank })

  // ------------------------------------------------------------- the header
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', user.id)
    .maybeSingle()
  const settings = (settingsRow as Settings | null) ?? {}

  let className = settings.class_name ?? ''
  if (scope.mode === 'v2') {
    const { data } = await supabase
      .from('classes')
      .select('name')
      .eq('id', scope.classId)
      .maybeSingle()
    className = data?.name ?? className
  }

  const monthLabel = MONTH_LABEL_BY_ID[request.period] ?? request.period
  const periodLabel = `ខែ${monthLabel} ឆ្នាំសិក្សា ${request.academicYear}`

  const scored = computed.filter((c) => c.average !== null)
  const classAverage = scored.length
    ? scored.reduce((a, c) => a + (c.average ?? 0), 0) / scored.length
    : null

  return {
    students: computed,
    subjects,
    scheme,
    classAverage,
    className,
    gradeNumber: context?.gradeNumber ?? null,
    settings,
    monthLabel,
    periodLabel,
    rosterIds,
    teacherId: scope.teacherId,
    scope,
    numericKeys: keys,
  }
}

/** Header tokens every monthly class document shares. */
function headerScalars(data: MonthlyClassData, academicYear: string) {
  const s = data.settings
  return {
    'school.name': s.school_name ?? '',
    'school.code': s.school_code ?? '',
    'school.unit1': s.management_unit_1 ?? '',
    'school.unit2': s.management_unit_2 ?? '',
    'class.name': data.className,
    'class.grade': data.gradeNumber ? toKhmerNumber(data.gradeNumber) : '',
    'class.count': toKhmerNumber(data.students.length),
    'class.average': data.classAverage === null ? '' : Number(data.classAverage.toFixed(2)),
    'period.label': data.periodLabel,
    'period.month': data.monthLabel,
    'period.year': academicYear,
    'teacher.name': s.homeroom_teacher ?? s.teacher_name ?? '',
    'director.name': s.director_name ?? s.manager_name ?? '',
    'director.role': s.manager_role ?? 'នាយកសាលា',
    'province.date': s.province_for_date ?? s.province_date ?? '',
  }
}

/**
 * `score_monthly` — the marks grid, in register order (§20 of the engine phase).
 */
export async function resolveScoreMonthly(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  const data = await resolveMonthlyClass(request)
  if ('error' in data) return data

  const rows: ReportRow[] = data.students.map((c, i) => {
    const average = c.average
    const grade = average === null ? null : gradeFor(average, data.scheme)

    return {
      values: {
        'row.no': toKhmerNumber(i + 1),
        'row.name': c.student.name_kh || c.student.name_en || '',
        'row.gender': c.student.gender ?? '',
        'row.student_id': c.student.student_id ?? '',
        'row.total': c.total || null,
        'row.average': average === null ? null : Number(average.toFixed(2)),
        'row.grade': grade?.label ?? '',
        'row.letter': grade?.letter ?? '',
        'row.rank': average === null ? '' : toKhmerNumber(c.rank),
      },
      subjectValues: data.subjects.map((subject) => {
        const raw = c.scores[subject.key]
        if (raw === null || raw === undefined || raw === '') return null
        const value = Number(raw)
        return Number.isFinite(value) ? value : String(raw)
      }),
    }
  })

  return {
    payload: {
      scalars: headerScalars(data, request.academicYear),
      subjects: data.subjects,
      rows,
    },
    summary: {
      studentCount: data.students.length,
      subjectCount: data.subjects.length,
      average: data.classAverage,
      periodLabel: data.periodLabel,
      className: data.className,
    },
  }
}

/**
 * `ranking_monthly` — the same class, ordered by where pupils placed.
 *
 * Shares every number with `score_monthly` because both come out of
 * `resolveMonthlyClass`; the only difference is presentation. Two things are
 * deliberate:
 *
 * **Rank order, not register order.** A ranking sheet is read top-down to find
 * who placed where, so rows are sorted by rank. Ties keep the shared rank and
 * the next rank skips (1,2,2,4) — `assignRanks`' behaviour, unchanged (§7).
 *
 * **Unmarked pupils sort last, and show no rank.** A pupil with no marks has
 * `average === null`, which `assignRanks` weighs as 0; printing them as "last
 * place" would state a result they have not been assessed for, so their rank
 * cell is blank and they are grouped at the foot of the sheet.
 */
export async function resolveRankingMonthly(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  const data = await resolveMonthlyClass(request)
  if ('error' in data) return data

  const ordered = [...data.students].sort((a, b) => {
    // Unmarked pupils to the foot, then by rank, then by register order for a
    // stable sheet — two pupils sharing a rank must not swap between runs.
    const aMarked = a.average !== null
    const bMarked = b.average !== null
    if (aMarked !== bMarked) return aMarked ? -1 : 1
    if (a.rank !== b.rank) return a.rank - b.rank
    return String(a.student.name_kh ?? '').localeCompare(String(b.student.name_kh ?? ''), 'km')
  })

  const rows: ReportRow[] = ordered.map((c, i) => {
    const average = c.average
    const grade = average === null ? null : gradeFor(average, data.scheme)

    return {
      values: {
        'row.no': toKhmerNumber(i + 1),
        'row.rank': average === null ? '' : toKhmerNumber(c.rank),
        'row.name': c.student.name_kh || c.student.name_en || '',
        'row.gender': c.student.gender ?? '',
        'row.student_id': c.student.student_id ?? '',
        'row.total': c.total || null,
        'row.average': average === null ? null : Number(average.toFixed(2)),
        'row.grade': grade?.label ?? '',
        'row.letter': grade?.letter ?? '',
        // The pass mark comes from the class's scheme, never a constant.
        'row.status': average === null ? ''
          : average >= data.scheme.passMark ? 'ជាប់' : 'ធ្លាក់',
      },
      subjectValues: data.subjects.map((subject) => {
        const raw = c.scores[subject.key]
        if (raw === null || raw === undefined || raw === '') return null
        const value = Number(raw)
        return Number.isFinite(value) ? value : String(raw)
      }),
    }
  })

  const marked = data.students.filter((c) => c.average !== null)
  const passed = marked.filter((c) => (c.average ?? 0) >= data.scheme.passMark).length

  return {
    payload: {
      scalars: {
        ...headerScalars(data, request.academicYear),
        'class.scored': toKhmerNumber(marked.length),
        'class.passed': toKhmerNumber(passed),
        'class.failed': toKhmerNumber(marked.length - passed),
        'class.passmark': toKhmerNumber(data.scheme.passMark),
      },
      subjects: data.subjects,
      rows,
    },
    summary: {
      studentCount: data.students.length,
      subjectCount: data.subjects.length,
      average: data.classAverage,
      periodLabel: data.periodLabel,
      className: data.className,
    },
  }
}

/**
 * Every monthly average a class earned this academic year, per pupil per month.
 *
 * ONE query for the whole year, matching on the period suffix — the shape
 * `getMonthlyScoresForYear` already uses for the totals screen's trend chart.
 * The alternative is a request per month, which is five to seven sequential
 * round trips on a classroom connection to compute one column.
 *
 * `score_period` for a monthly mark is `${month}-${academicYear}`, e.g.
 * `jan-2025-2026`. Homework uses an underscore and a different `score_type`, so
 * the two cannot collide.
 */
async function fetchMonthlyAverages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  academicYear: string,
  rosterIds: string[] | null,
  teacherId: string,
  keys: string[],
  maxByColumn: Record<string, number>,
  scheme: ReturnType<typeof schemeForLevel>,
): Promise<Record<string, Record<string, number>>> {
  let query = supabase
    .from('scores')
    .select('student_id, subject, score_value, score_text, score_period')
    .eq('score_type', 'monthly')
    .like('score_period', `%-${academicYear}`)

  query = rosterIds ? query.in('student_id', rosterIds) : query.eq('teacher_id', teacherId)

  const { data, error } = await query
  if (error) {
    logger.error('fetchMonthlyAverages:', error)
    return {}
  }

  // student -> month -> subject -> value
  const grouped: Record<string, Record<string, Record<string, number | string | null>>> = {}
  for (const row of (data ?? []) as (Score & { score_period: string })[]) {
    const month = row.score_period.replace(`-${academicYear}`, '')
    const byMonth = grouped[row.student_id] ?? (grouped[row.student_id] = {})
    const bucket = byMonth[month] ?? (byMonth[month] = {})
    bucket[row.subject] = scoreCellValue(row)
  }

  const out: Record<string, Record<string, number>> = {}
  for (const [studentId, months] of Object.entries(grouped)) {
    out[studentId] = {}
    for (const [month, scores] of Object.entries(months)) {
      // The same per-month average the totals screen computes, through the
      // same helper — never a second formula.
      const { average } = studentAverage(scores, keys, maxByColumn, scheme)
      if (average !== null) out[studentId][month] = average
    }
  }
  return out
}

/**
 * `ranking_semester` — the semester league table.
 *
 * Built on `resolveMonthlyClass` for everything that is not semester-specific:
 * the class scope, the roster, the subject selection, the scheme and the
 * header all come from there, so a change to how a class resolves reaches this
 * report for free (§5/§12).
 *
 * What it adds is the semester's own arithmetic, and all of it is delegated:
 * `semesterAverage` (`lib/scores/semester.ts`) and the class's own period
 * calendar via `periodKeysForSemester` (`lib/scores/calendar.ts`) are the
 * definitions `/score/total` itself seeds from, so the printed sheet and the
 * screen cannot disagree (§4/§23).
 *
 * A semester average is half exam, half coursework. Note the deliberate
 * asymmetry inherited from `/score/total`: a *missing subject* inside either
 * half is skipped, but a *missing half* counts as zero — a pupil who sat the
 * exam and has no monthly marks scores half what they wrote. That is the
 * product's existing definition, preserved rather than improved (§8).
 */
/**
 * Everything a semester report needs, resolved once.
 *
 * Extracted for exactly the reason `resolveMonthlyClass` was (§9): `score_semester`
 * and `ranking_semester` print very different documents — a marks grid in
 * register order, and a league table in rank order — from the *same* class, the
 * same exam marks, the same coursework and the same averages. Two resolvers
 * each doing their own arithmetic is how a ranking sheet ends up disagreeing
 * with the score sheet it was derived from.
 *
 * A semester average is half exam, half coursework, and both halves are
 * delegated: `semesterAverage` (`lib/scores/semester.ts`) and the class's own
 * period calendar via `periodKeysForSemester` (`lib/scores/calendar.ts`) are the
 * definitions `/score/total` itself seeds from, so the printed sheet and the
 * screen cannot disagree (§4/§23).
 *
 * Note the deliberate asymmetry inherited from `/score/total`: a *missing
 * subject* inside either half is skipped, but a *missing half* counts as zero —
 * a pupil who sat the exam and has no monthly marks scores half what they
 * wrote. That is the product's existing definition, preserved rather than
 * improved (§8).
 */
interface SemesterClassData {
  base: MonthlyClassData
  semester: SemesterId
  students: (MonthlyClassData['students'][number] & {
    examAverage: number | null
    monthly: number | null
    average: number | null
    rank: number
  })[]
  /** Periods the coursework half averaged, on the class's own calendar. */
  months: MonthId[]
  classAverage: number | null
  marked: number
  passed: number
  periodLabel: string
}

async function resolveSemesterClass(
  request: ReportRequest,
): Promise<SemesterClassData | { error: string }> {
  const semester: SemesterId = isSemesterId(request.period) ? request.period : 'sem1'

  // The class context, resolved exactly as the monthly reports resolve it.
  const base = await resolveMonthlyClass(
    { ...request, period: 'nov' },
    { scoreType: 'semester', periodOverride: `${semester}-${request.academicYear}` },
  )
  if ('error' in base) return base

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'សូមចូលគណនីជាមុនសិន' }

  const maxByColumn = Object.fromEntries(base.subjects.map((s) => [s.key, s.maxScore]))
  const monthlyAverages = await fetchMonthlyAverages(
    supabase, request.academicYear, base.rosterIds, base.teacherId,
    base.numericKeys, maxByColumn, base.scheme,
  )

  // The class's own period calendar (00029), resolved through the scope the
  // base resolver already validated. A merged period contributes its anchor
  // key once, so the coursework denominator here is the same one `/score/total`
  // seeds from — the screen-vs-paper divergence this closes. A class with no
  // calendar rows resolves the default, which is byte-identical to the old
  // `monthsForSemester(semester)`.
  const calendar = await fetchScoreCalendar(base.scope, request.academicYear)
  const months = periodKeysForSemester(calendar, semester)

  const computed = base.students.map((c) => {
    const monthly = monthlyComponent(monthlyAverages[c.student.id], months)
    // `c.average` here is the EXAM half — `resolveMonthlyClass` averaged the
    // semester score rows. The semester average combines it with coursework.
    const average = semesterAverage(c.average, monthly)
    return { ...c, examAverage: c.average, monthly, average, rank: 0 }
  })

  // Canonical competition ranking: ties share a rank, the next rank skips (§9).
  assignRanks([...computed], (r) => r.average ?? 0, (r, rank) => { r.rank = rank })

  const marked = computed.filter((c) => c.average !== null)
  const passed = marked.filter((c) => (c.average ?? 0) >= base.scheme.passMark).length
  const classAverage = marked.length
    ? marked.reduce((a, c) => a + (c.average ?? 0), 0) / marked.length
    : null

  return {
    base,
    semester,
    students: computed,
    months,
    classAverage,
    marked: marked.length,
    passed,
    periodLabel: `${semesterLabel(semester)} ឆ្នាំសិក្សា ${request.academicYear}`,
  }
}

/** Header tokens both semester documents share. */
function semesterScalars(data: SemesterClassData, academicYear: string) {
  return {
    ...headerScalars(data.base, academicYear),
    'period.label': data.periodLabel,
    'period.semester': semesterLabel(data.semester),
    'class.average': data.classAverage === null ? '' : Number(data.classAverage.toFixed(2)),
    'class.scored': toKhmerNumber(data.marked),
    'class.passed': toKhmerNumber(data.passed),
    'class.failed': toKhmerNumber(data.marked - data.passed),
    'class.passmark': toKhmerNumber(data.base.scheme.passMark),
    'class.months': toKhmerNumber(data.months.length),
  }
}

/** The row tokens both semester documents share for one pupil. */
function semesterRowValues(
  c: SemesterClassData['students'][number],
  index: number,
  scheme: ReturnType<typeof schemeForLevel>,
): Record<string, CellValue> {
  const average = c.average
  const grade = average === null ? null : gradeFor(average, scheme)

  return {
    'row.no': toKhmerNumber(index + 1),
    'row.rank': average === null ? '' : toKhmerNumber(c.rank),
    'row.name': c.student.name_kh || c.student.name_en || '',
    'row.gender': c.student.gender ?? '',
    'row.student_id': c.student.student_id ?? '',
    'row.exam': c.examAverage === null ? null : Number(c.examAverage.toFixed(2)),
    'row.monthly': c.monthly === null ? null : Number(c.monthly.toFixed(2)),
    'row.total': c.total || null,
    'row.average': average === null ? null : Number(average.toFixed(2)),
    'row.grade': grade?.label ?? '',
    'row.letter': grade?.letter ?? '',
    'row.status': average === null ? ''
      : average >= scheme.passMark ? 'ជាប់' : 'ធ្លាក់',
  }
}

/** Each pupil's exam marks, in the subject order the document prints. */
function semesterSubjectValues(
  c: SemesterClassData['students'][number],
  subjects: ReportSubjectColumn[],
): CellValue[] {
  return subjects.map((subject) => {
    const raw = c.scores[subject.key]
    if (raw === null || raw === undefined || raw === '') return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : String(raw)
  })
}

/**
 * `score_semester` — the semester marks grid, in register order.
 *
 * The semester counterpart of `score_monthly`, and the same relationship to
 * `ranking_semester` that `score_monthly` has to `ranking_monthly`: identical
 * numbers, opposite reading order. A marks grid is checked pupil-by-pupil
 * against the register, so rows stay in roster order and the rank is a column
 * rather than the sort key.
 */
export async function resolveScoreSemester(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  const data = await resolveSemesterClass(request)
  if ('error' in data) return data

  const rows: ReportRow[] = data.students.map((c, i) => ({
    values: semesterRowValues(c, i, data.base.scheme),
    subjectValues: semesterSubjectValues(c, data.base.subjects),
  }))

  return {
    payload: {
      scalars: semesterScalars(data, request.academicYear),
      subjects: data.base.subjects,
      rows,
    },
    summary: {
      studentCount: data.base.students.length,
      subjectCount: data.base.subjects.length,
      average: data.classAverage,
      periodLabel: data.periodLabel,
      className: data.base.className,
    },
  }
}

/**
 * `ranking_semester` — the same class, ordered by where pupils placed.
 *
 * Shares every number with `score_semester` because both come out of
 * `resolveSemesterClass`; the only difference is presentation. Unmarked pupils
 * sort last and print no rank, rather than being shown as last place for a
 * semester they were never assessed in.
 */
export async function resolveRankingSemester(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  const data = await resolveSemesterClass(request)
  if ('error' in data) return data

  const ordered = [...data.students].sort((a, b) => {
    const aMarked = a.average !== null
    const bMarked = b.average !== null
    if (aMarked !== bMarked) return aMarked ? -1 : 1
    if (a.rank !== b.rank) return a.rank - b.rank
    return String(a.student.name_kh ?? '').localeCompare(String(b.student.name_kh ?? ''), 'km')
  })

  const rows: ReportRow[] = ordered.map((c, i) => ({
    values: semesterRowValues(c, i, data.base.scheme),
    subjectValues: semesterSubjectValues(c, data.base.subjects),
  }))

  return {
    payload: {
      scalars: semesterScalars(data, request.academicYear),
      subjects: data.base.subjects,
      rows,
    },
    summary: {
      studentCount: data.base.students.length,
      subjectCount: data.base.subjects.length,
      average: data.classAverage,
      periodLabel: data.periodLabel,
      className: data.base.className,
    },
  }
}

/**
 * `honor` — the honour roll, by criteria rather than by position.
 *
 * The class context, subjects, scheme and canonical averages all come from
 * `resolveMonthlyClass`, so the average printed beside a pupil's name is the
 * same number `/score/total` shows (§4/§20). This resolver never computes an
 * average; it only judges the ones it is given.
 *
 * THE CRITERIA ARE PROVISIONAL. The product defines no official honour rule —
 * `/honor-roll` takes the top five, which is its podium layout rather than a
 * policy — so `defaultHonorCriteria` derives thresholds from the class's own
 * grading scheme and the payload carries `criteria.provenance = 'derived'` onto
 * the document. See `lib/scores/honor.ts`.
 *
 * Rank is resolved and printed as a supporting column (§8), but it decides
 * nothing: a class of thirty may produce twenty honourees or none.
 */
export async function resolveHonor(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  const base = await resolveMonthlyClass(request)
  if ('error' in base) return base

  const criteria = defaultHonorCriteria(base.scheme)
  const maxByColumn = Object.fromEntries(base.subjects.map((s) => [s.key, s.maxScore]))

  const judged = base.students.map((c) => ({
    ...c,
    verdict: evaluateHonor(
      {
        average: c.average,
        scores: c.scores,
        subjectKeys: base.numericKeys,
        maxByColumn,
      },
      criteria,
      base.scheme,
    ),
  }))

  const eligible = judged.filter((c) => c.verdict.eligible)

  // §10: deterministic order — average descending, then name, so two pupils on
  // the same average never swap between two runs of the same report.
  const ordered = [...eligible].sort((a, b) => {
    const diff = (b.average ?? 0) - (a.average ?? 0)
    if (diff !== 0) return diff
    return String(a.student.name_kh ?? '').localeCompare(String(b.student.name_kh ?? ''), 'km')
  })

  const rows: ReportRow[] = ordered.map((c, i) => {
    const average = c.average
    const grade = average === null ? null : gradeFor(average, base.scheme)

    return {
      values: {
        'row.no': toKhmerNumber(i + 1),
        'row.name': c.student.name_kh || c.student.name_en || '',
        'row.gender': c.student.gender ?? '',
        'row.student_id': c.student.student_id ?? '',
        'row.average': average === null ? null : Number(average.toFixed(2)),
        'row.grade': grade?.label ?? '',
        'row.letter': grade?.letter ?? '',
        // Supporting only — the honour list is not ordered by it and does not
        // depend on it.
        'row.rank': average === null ? '' : toKhmerNumber(c.rank),
        'row.subjects': toKhmerNumber(c.verdict.markedSubjects),
      },
      subjectValues: base.subjects.map((subject) => {
        const raw = c.scores[subject.key]
        if (raw === null || raw === undefined || raw === '') return null
        const value = Number(raw)
        return Number.isFinite(value) ? value : String(raw)
      }),
    }
  })

  const honorAverage = ordered.length
    ? ordered.reduce((a, c) => a + (c.average ?? 0), 0) / ordered.length
    : null

  return {
    payload: {
      scalars: {
        ...headerScalars(base, request.academicYear),
        'honor.count': toKhmerNumber(ordered.length),
        'honor.total': toKhmerNumber(base.students.length),
        'honor.average': honorAverage === null ? '' : Number(honorAverage.toFixed(2)),
        'honor.criteria': criteria.label,
        // Printed on the sheet, not buried in metadata (§25).
        'honor.provenance': 'លក្ខណៈវិនិច្ឆ័យបណ្ដោះអាសន្ន — មិនមែនផ្លូវការពីក្រសួងទេ',
      },
      subjects: base.subjects,
      rows,
    },
    summary: {
      studentCount: base.students.length,
      subjectCount: base.subjects.length,
      average: honorAverage,
      periodLabel: base.periodLabel,
      className: base.className,
      // Surfaced in the preview so the teacher sees the rule before generating.
      honorCount: ordered.length,
      criteriaLabel: criteria.label,
      criteriaProvisional: HONOR_CRITERIA_PROVENANCE === 'derived',
    },
  }
}

// ===========================================================================
// The annual layer (§19)
// ===========================================================================

/**
 * One pupil's year, joined to the pupil.
 *
 * `AnnualResult` (`lib/scores/annual.ts`) carries the rules; this carries the
 * facts a document needs beside them — the exam and coursework halves each
 * semester was built from, the monthly timeline, and the per-subject figures.
 * Domain only (§19): no formatting, no sort state, no UI concern. All seven
 * yearly reports and `ranking_annual` read this same object, which is what
 * stops them becoming eight arithmetics of the same year.
 */
export interface AnnualStudentResult {
  student: Student
  annual: AnnualResult
  /** The exam half of each semester — `resolveMonthlyClass`'s average. */
  exam: { sem1: number | null; sem2: number | null }
  /** The coursework half — `monthlyComponent` over the semester's periods. */
  coursework: { sem1: number | null; sem2: number | null }
  /** Month key -> that month's canonical average. Absent months are unmarked. */
  monthly: Record<string, number>
  /** Per-subject semester marks, keyed by column id. */
  scores: { sem1: Record<string, number | string | null>; sem2: Record<string, number | string | null> }
  /** Per-subject annual figure: the mean of the semester marks that exist. */
  subjectAnnual: Record<string, number | null>
  rank: number
}

export interface AnnualClassData {
  base: MonthlyClassData
  students: AnnualStudentResult[]
  /** Periods each semester draws its coursework from, on the class's calendar. */
  months: { sem1: MonthId[]; sem2: MonthId[] }
  /** Every period of the year in order — the monthly reports' column set. */
  allMonths: MonthId[]
  threshold: number
  classAverage: number | null
  /** Weakest provenance across the class, for the sheet's note (§31). */
  source: AnnualValueSource
  periodLabel: string
  counts: { promoted: number; repeated: number; incomplete: number }
}

/** One period's marks for the whole roster, as subject -> value per pupil. */
async function fetchPeriodScores(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scoreType: string,
  period: string,
  rosterIds: string[] | null,
  teacherId: string,
): Promise<Map<string, Record<string, number | string | null>>> {
  let query = supabase
    .from('scores')
    .select('student_id, subject, score_value, score_text')
    .eq('score_type', scoreType)
    .eq('score_period', period)

  query = rosterIds ? query.in('student_id', rosterIds) : query.eq('teacher_id', teacherId)

  const { data, error } = await query
  const out = new Map<string, Record<string, number | string | null>>()
  if (error) {
    logger.error('fetchPeriodScores:', error)
    return out
  }
  for (const row of (data ?? []) as Score[]) {
    const bucket = out.get(row.student_id) ?? {}
    bucket[row.subject] = scoreCellValue(row)
    out.set(row.student_id, bucket)
  }
  return out
}

/**
 * Everything an annual report needs, resolved once (§19).
 *
 * Built on `resolveMonthlyClass` for the class context — scope, roster, score
 * template, selection, scheme, letterhead — so nothing about *which* class or
 * *which* subjects is decided a second time. The base call reads ឆមាសទី១'s
 * exam marks; ឆមាសទី២'s are one further query, the monthly timeline one more,
 * and the stored annual sheet one more. Four round trips for the whole year,
 * no query inside a loop (§41).
 *
 * The two halves of every semester are then combined by the SAME
 * `semesterAverage` `/score/total` and `ranking_semester` use, and the year by
 * the same `computeAnnualAverage` `/score/total`'s ឆ្នាំ tab uses — with the
 * stored sheet preferred when it exists. `lib/scores/annual.ts` explains why
 * the fallback has to be there at all.
 */
export async function resolveAnnualClass(
  request: ReportRequest,
): Promise<AnnualClassData | { error: string }> {
  // ឆមាសទី១'s exam marks, and the class context every annual report shares.
  const base = await resolveMonthlyClass(
    { ...request, period: 'nov' },
    { scoreType: 'semester', periodOverride: `sem1-${request.academicYear}` },
  )
  if ('error' in base) return base

  const supabase = await createClient()
  const maxByColumn = Object.fromEntries(base.subjects.map((s) => [s.key, s.maxScore]))

  const [sem2Scores, monthlyAverages, annualRows, calendar] = await Promise.all([
    fetchPeriodScores(
      supabase, 'semester', `sem2-${request.academicYear}`, base.rosterIds, base.teacherId,
    ),
    fetchMonthlyAverages(
      supabase, request.academicYear, base.rosterIds, base.teacherId,
      base.numericKeys, maxByColumn, base.scheme,
    ),
    fetchPeriodScores(
      supabase, 'annual', `annual-${request.academicYear}`, base.rosterIds, base.teacherId,
    ),
    fetchScoreCalendar(base.scope, request.academicYear),
  ])

  // The class's own period calendar (00029), never a compiled-in month split.
  const months = {
    sem1: periodKeysForSemester(calendar, 'sem1'),
    sem2: periodKeysForSemester(calendar, 'sem2'),
  }
  const allMonths = [...calendar].sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.key)

  const threshold = promotionThreshold(base.scheme)

  const computed: AnnualStudentResult[] = base.students.map((c) => {
    const sem1Scores = c.scores
    const s2 = sem2Scores.get(c.student.id) ?? {}

    // The exam half of each semester, through the canonical `studentAverage` —
    // the base resolver already produced ឆមាសទី១'s, so only ឆមាសទី២'s is new.
    const examSem1 = c.average
    const examSem2 = studentAverage(s2, base.numericKeys, maxByColumn, base.scheme).average

    const monthly = monthlyAverages[c.student.id] ?? {}
    const courseworkSem1 = monthlyComponent(monthly, months.sem1)
    const courseworkSem2 = monthlyComponent(monthly, months.sem2)

    const stored = annualRows.get(c.student.id) ?? {}

    const annual = buildAnnualResult(
      {
        sem1Stored: storedAnnualValue(stored[SEM1_KEY]),
        sem2Stored: storedAnnualValue(stored[SEM2_KEY]),
        sem1Derived: semesterAverage(examSem1, courseworkSem1),
        sem2Derived: semesterAverage(examSem2, courseworkSem2),
      },
      threshold,
    )

    // Per-subject annual: the mean of the semester marks that exist, on the
    // same "missing stays missing" rule every other average follows.
    const subjectAnnual: Record<string, number | null> = {}
    for (const subject of base.subjects) {
      const values = [sem1Scores[subject.key], s2[subject.key]]
        .map((raw) => (raw === null || raw === undefined || raw === '' ? null : Number(raw)))
        .filter((v): v is number => v !== null && Number.isFinite(v))
      subjectAnnual[subject.key] = values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : null
    }

    return {
      student: c.student,
      annual,
      exam: { sem1: examSem1, sem2: examSem2 },
      coursework: { sem1: courseworkSem1, sem2: courseworkSem2 },
      monthly,
      scores: { sem1: sem1Scores, sem2: s2 },
      subjectAnnual,
      rank: 0,
    }
  })

  // Canonical competition ranking: ties share a rank, the next rank skips (§37).
  assignRanks([...computed], (r) => r.annual.average ?? 0, (r, rank) => { r.rank = rank })

  const marked = computed.filter((c) => c.annual.average !== null)
  const classAverage = marked.length
    ? marked.reduce((a, c) => a + (c.annual.average ?? 0), 0) / marked.length
    : null

  // Weakest provenance wins: one derived semester anywhere makes the class's
  // note say derived, because the sheet must not overclaim.
  const sources = new Set(computed.map((c) => c.annual.source).filter((s) => s !== 'none'))
  const source: AnnualValueSource =
    sources.size === 0 ? 'none' : sources.has('derived') ? 'derived' : 'stored'

  const counts = {
    promoted: computed.filter((c) => c.annual.status === 'promoted').length,
    repeated: computed.filter((c) => c.annual.status === 'repeated').length,
    incomplete: computed.filter((c) => c.annual.status === 'incomplete').length,
  }

  return {
    base,
    students: computed,
    months,
    allMonths,
    threshold,
    classAverage,
    source,
    periodLabel: `ឆ្នាំសិក្សា ${request.academicYear}`,
    counts,
  }
}

/** Header tokens every annual document shares, on top of the class letterhead. */
function annualScalars(data: AnnualClassData, academicYear: string) {
  const marked = data.students.filter((c) => c.annual.average !== null).length
  return {
    ...headerScalars(data.base, academicYear),
    'period.label': data.periodLabel,
    'period.year': academicYear,
    'class.average': data.classAverage === null ? '' : Number(data.classAverage.toFixed(2)),
    'class.scored': toKhmerNumber(marked),
    'class.passmark': toKhmerNumber(data.threshold),
    'class.promoted': toKhmerNumber(data.counts.promoted),
    'class.repeated': toKhmerNumber(data.counts.repeated),
    'class.incomplete': toKhmerNumber(data.counts.incomplete),
    // Printed on the paper, not buried in metadata (§31).
    'annual.source': annualSourceNote(data.source),
  }
}

/** Pupils in rank order, unmarked last, stable between runs. */
function byRank(students: AnnualStudentResult[]): AnnualStudentResult[] {
  return [...students].sort((a, b) => {
    const aMarked = a.annual.average !== null
    const bMarked = b.annual.average !== null
    if (aMarked !== bMarked) return aMarked ? -1 : 1
    if (a.rank !== b.rank) return a.rank - b.rank
    return String(a.student.name_kh ?? '').localeCompare(String(b.student.name_kh ?? ''), 'km')
  })
}

/** The row tokens every annual document shares for one pupil. */
function annualRowValues(
  c: AnnualStudentResult,
  index: number,
  scheme: ReturnType<typeof schemeForLevel>,
): Record<string, CellValue> {
  const average = c.annual.average
  const grade = average === null ? null : gradeFor(average, scheme)
  return {
    'row.no': toKhmerNumber(index + 1),
    'row.name': c.student.name_kh || c.student.name_en || '',
    'row.gender': c.student.gender ?? '',
    'row.student_id': c.student.student_id ?? '',
    'row.dob': c.student.dob ?? '',
    'row.sem1': c.annual.sem1.value === null ? null : Number(c.annual.sem1.value.toFixed(2)),
    'row.sem2': c.annual.sem2.value === null ? null : Number(c.annual.sem2.value.toFixed(2)),
    'row.average': average === null ? null : Number(average.toFixed(2)),
    'row.grade': grade?.label ?? '',
    'row.letter': grade?.letter ?? '',
    'row.rank': average === null ? '' : toKhmerNumber(c.rank),
    'row.status': annualStatusLabel(c.annual.status),
  }
}

/**
 * `ranking_annual` — the year's league table.
 *
 * Adds nothing arithmetic to `resolveAnnualClass`: the average is that layer's,
 * the rank is `assignRanks`', the pass line is the scheme's. What it decides is
 * presentation — rank order, unmarked pupils at the foot with a blank rank
 * rather than a last place they were never assessed for, exactly as
 * `ranking_monthly` and `ranking_semester` already do (§9/§37).
 */
export async function resolveRankingAnnual(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  const data = await resolveAnnualClass(request)
  if ('error' in data) return data

  const ordered = byRank(data.students)

  const rows: ReportRow[] = ordered.map((c, i) => ({
    values: annualRowValues(c, i, data.base.scheme),
    subjectValues: data.base.subjects.map((subject) => {
      const value = c.subjectAnnual[subject.key]
      return value === null || value === undefined ? null : Number(value.toFixed(2))
    }),
  }))

  return {
    payload: {
      scalars: annualScalars(data, request.academicYear),
      subjects: data.base.subjects,
      rows,
    },
    summary: {
      studentCount: data.students.length,
      subjectCount: data.base.subjects.length,
      average: data.classAverage,
      periodLabel: data.periodLabel,
      className: data.base.className,
    },
  }
}

/**
 * `certificate` — បណ្ណសរសើរ, one page per pupil, through the DOCX path.
 *
 * The first report in the product to exercise the Word writer with a real
 * template, which is why §10 forbids calling DOCX support ready until this
 * exists. Everything it prints is canonical: the average and the placing come
 * from `resolveAnnualClass`, so a certificate and the ranking sheet that
 * justifies it cannot disagree.
 *
 * WHO GETS ONE. `request.studentIds` when the teacher picked pupils, otherwise
 * every pupil with an annual result. Never an unmarked pupil: a certificate
 * asserting a placing for someone who has not been assessed is a false
 * document, and `incomplete` is precisely the state that says so (§36).
 *
 * SECURITY (§33). The selection is intersected with the roster the scope
 * resolver already validated — a forged `studentIds` entry names a pupil that
 * is simply not in the set, so it cannot widen access, and RLS refuses it again
 * independently.
 */
export async function resolveCertificate(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  const data = await resolveAnnualClass(request)
  if ('error' in data) return data

  // WHO IS ELIGIBLE BY DEFAULT. `បណ្ណសរសើរ` is a certificate of praise, so the
  // default cohort is the pupils who PASSED the year — `status === 'promoted'`,
  // the same canonical rule `annual_promoted_students` uses and the same
  // threshold `/yearly-report` has always applied. No new criterion is
  // introduced: a pupil who repeats the year is not praised for it, and a pupil
  // with no result has no placing to certify at all (§36).
  //
  // A teacher who wants a certificate for a specific pupil regardless passes
  // `studentIds`, which is checked against the roster below rather than against
  // this rule — the selection is the teacher's judgement, the default is not.
  const eligible = data.students.filter((c) => c.annual.status === 'promoted')
  const assessed = data.students.filter((c) => c.annual.status !== 'incomplete')

  // The request narrows; it never widens. Intersecting with the resolved roster
  // is what makes a forged id inert rather than dangerous.
  const requested = request.studentIds?.length ? new Set(request.studentIds) : null
  const chosen = requested
    ? assessed.filter((c) => requested.has(c.student.id))
    : eligible

  const ordered = byRank(chosen)
  const cohort = data.students.length

  const rows: ReportRow[] = ordered.map((c, i) => {
    const average = c.annual.average
    const grade = average === null ? null : gradeFor(average, data.base.scheme)

    // Composed from the canonical figures, never re-derived from marks.
    const achievement =
      `បានប្រឡងជាប់ចំណាត់ថ្នាក់លេខ ${toKhmerNumber(c.rank)} ក្នុងចំណោមសិស្ស `
      + `${toKhmerNumber(cohort)} នាក់ ដោយទទួលបានមធ្យមភាគ `
      + `${average === null ? '' : average.toFixed(2)} និទ្ទេស ${grade?.label ?? ''}`

    return {
      values: {
        ...annualRowValues(c, i, data.base.scheme),
        achievement,
      },
      subjectValues: [],
    }
  })

  return {
    payload: {
      scalars: {
        ...annualScalars(data, request.academicYear),
        'certificate.provenance':
          'ទម្រង់បណ្ណសរសើរនេះបង្កើតឡើងដោយ KruSmart — មិនមែនចម្លងផ្ទាល់ពីឯកសារផ្លូវការរបស់ក្រសួងទេ',
      },
      // A certificate prints no marks table, so the subject region is empty —
      // the payload contract allows it and the writer simply has nothing to
      // expand.
      subjects: [],
      rows,
    },
    summary: {
      studentCount: rows.length,
      subjectCount: 0,
      average: data.classAverage,
      periodLabel: data.periodLabel,
      className: data.base.className,
    },
  }
}

// ===========================================================================
// The annual family (§11-§18)
// ===========================================================================

/**
 * ★ THE VARIABLE REGION IS NOT ALWAYS SUBJECTS.
 *
 * `ReportPayload.subjects` is the payload's ONE dynamic column region — the
 * part of a layout whose width the data decides rather than the template. Four
 * of the reports below fill it with something other than subjects: two fill it
 * with the year's MONTHS, one with the scheme's GRADE BANDS, and
 * `annual_subject_results` puts subjects in the ROWS instead.
 *
 * That is deliberate, and it is the alternative to a second expansion
 * mechanism, which §25 forbids outright. The writer's job is "widen this region
 * to fit the data"; what the data means is the resolver's business. The type is
 * named for its first use, not its only one — `ReportSubjectColumn.key` is
 * simply the id a resolver looks a value up by.
 */

/** The year's periods as dynamic columns, on the class's own calendar. */
function monthColumns(data: AnnualClassData): ReportSubjectColumn[] {
  return data.allMonths.map((month) => ({
    key: month,
    label: MONTH_LABEL_BY_ID[month] ?? month,
    maxScore: data.base.scheme.maxScore,
  }))
}

/**
 * Each month's ranking, computed once for the whole year.
 *
 * Ranked per month through `assignRanks`, the same canonical walk every other
 * ranking uses (§37), over the monthly averages `resolveAnnualClass` already
 * fetched — so this adds no query and no second arithmetic. A pupil unmarked in
 * a month is absent from that month's ranking rather than placed last in it.
 */
function monthlyRanks(data: AnnualClassData): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}

  for (const month of data.allMonths) {
    const entries = data.students
      .filter((c) => typeof c.monthly[month] === 'number')
      .map((c) => ({ id: c.student.id, average: c.monthly[month], rank: 0 }))

    assignRanks(entries, (r) => r.average, (r, rank) => { r.rank = rank })

    out[month] = Object.fromEntries(entries.map((e) => [e.id, e.rank]))
  }

  return out
}

/**
 * `annual_summary` — បញ្ជីបូកលទ្ធផលសរុប.
 *
 * The whole class's year on one sheet, in register order: both semesters, the
 * annual average, the niddes, the placing and the promotion verdict. No subject
 * region — this is the totals list, and `annual_subject` is the sheet that
 * breaks the same year down by subject. Two reports, one resolver layer, no
 * second arithmetic (§19).
 */
export async function resolveAnnualSummary(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  const data = await resolveAnnualClass(request)
  if ('error' in data) return data

  const rows: ReportRow[] = data.students.map((c, i) => ({
    values: annualRowValues(c, i, data.base.scheme),
    subjectValues: [],
  }))

  return {
    payload: { scalars: annualScalars(data, request.academicYear), subjects: [], rows },
    summary: {
      studentCount: data.students.length,
      subjectCount: 0,
      average: data.classAverage,
      periodLabel: data.periodLabel,
      className: data.base.className,
    },
  }
}

/**
 * `annual_monthly_ranking` — ចំណាត់ថ្នាក់ និងនិទ្ទេស.
 *
 * One column per month of the year carrying where the pupil placed that month,
 * then the year's own average, niddes and placing. Nothing monthly is
 * recomputed: the averages are the ones `fetchMonthlyAverages` produced through
 * `studentAverage`, and every rank on the sheet is `assignRanks`' (§13/§37).
 *
 * A month a pupil has no marks in prints blank rather than a last place they
 * were never assessed for — the same rule the monthly ranking sheet follows.
 */
export async function resolveAnnualMonthlyRanking(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  const data = await resolveAnnualClass(request)
  if ('error' in data) return data

  const ranks = monthlyRanks(data)
  const columns = monthColumns(data)
  const ordered = byRank(data.students)

  const rows: ReportRow[] = ordered.map((c, i) => ({
    values: annualRowValues(c, i, data.base.scheme),
    subjectValues: columns.map((col) => {
      const rank = ranks[col.key]?.[c.student.id]
      return rank === undefined ? null : toKhmerNumber(rank)
    }),
  }))

  return {
    payload: {
      scalars: annualScalars(data, request.academicYear),
      subjects: columns,
      rows,
    },
    summary: {
      studentCount: data.students.length,
      subjectCount: columns.length,
      average: data.classAverage,
      periodLabel: data.periodLabel,
      className: data.base.className,
    },
  }
}

/**
 * `annual_monthly_average` — មធ្យមភាគប្រចាំឆ្នាំ.
 *
 * The monthly timeline, both semester figures and the year, side by side —
 * §14's requirement that three values appear without three formulas being
 * written. Each comes from the layer that owns it: the months from
 * `studentAverage`, the semesters from `semesterAverage` (or the stored sheet),
 * the year from `computeAnnualAverage`. This resolver does no arithmetic at all
 * beyond rounding for display.
 */
export async function resolveAnnualMonthlyAverage(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  const data = await resolveAnnualClass(request)
  if ('error' in data) return data

  const columns = monthColumns(data)

  const rows: ReportRow[] = data.students.map((c, i) => ({
    values: annualRowValues(c, i, data.base.scheme),
    subjectValues: columns.map((col) => {
      const value = c.monthly[col.key]
      // Absent, not zero: a month with no marks is a gap in the record (§36).
      return typeof value === 'number' ? Number(value.toFixed(2)) : null
    }),
  }))

  return {
    payload: {
      scalars: annualScalars(data, request.academicYear),
      subjects: columns,
      rows,
    },
    summary: {
      studentCount: data.students.length,
      subjectCount: columns.length,
      average: data.classAverage,
      periodLabel: data.periodLabel,
      className: data.base.className,
    },
  }
}

/**
 * `annual_subject` — មុខវិជ្ជាប្រចាំឆ្នាំ.
 *
 * One column per subject the CLASS actually teaches — its resolved score
 * template narrowed by its own selection (§21), never a constant — carrying
 * each pupil's annual figure for that subject.
 */
export async function resolveAnnualSubject(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  const data = await resolveAnnualClass(request)
  if ('error' in data) return data

  const rows: ReportRow[] = data.students.map((c, i) => ({
    values: annualRowValues(c, i, data.base.scheme),
    subjectValues: data.base.subjects.map((subject) => {
      const value = c.subjectAnnual[subject.key]
      return value === null || value === undefined ? null : Number(value.toFixed(2))
    }),
  }))

  return {
    payload: {
      scalars: annualScalars(data, request.academicYear),
      subjects: data.base.subjects,
      rows,
    },
    summary: {
      studentCount: data.students.length,
      subjectCount: data.base.subjects.length,
      average: data.classAverage,
      periodLabel: data.periodLabel,
      className: data.base.className,
    },
  }
}

/**
 * `annual_subject_results` — លទ្ធផលតាមមុខវិជ្ជា.
 *
 * The only report in the family whose ROWS are subjects rather than pupils: how
 * many passed each subject, how many reached A–C, how many failed, split total
 * and female as every ministry tally in this product is.
 *
 * The pass rule is NOT this resolver's. `tallySubject`
 * (`lib/scores/subject-results.ts`) is the same function
 * `/yearly-report/subject-results` now calls, extracted from that screen rather
 * than reimplemented, so the printed sheet and the screen cannot disagree about
 * what "ជាប់" means (§16). The dynamic region here carries the scheme's grade
 * bands, so a scheme with different letters needs no template change.
 */
export async function resolveAnnualSubjectResults(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  const data = await resolveAnnualClass(request)
  if ('error' in data) return data

  const scheme = data.base.scheme
  const letters = schemeLetters(scheme)

  const columns: ReportSubjectColumn[] = letters.map((letter) => ({
    key: letter,
    label: letter,
    maxScore: scheme.maxScore,
  }))

  const tallies = data.base.subjects.map((subject) => {
    const values = data.students.flatMap((c) => {
      const value = c.subjectAnnual[subject.key]
      if (value === null || value === undefined || !Number.isFinite(value)) return []
      return [{ value, female: isFemale(c.student.gender) }]
    })
    return tallySubject(subject.key, subject.label, values, subject.maxScore, scheme)
  })

  // A subject nobody has been marked in is left off rather than printed as a
  // row of zeroes — matching the legacy screen exactly (§35).
  const marked = tallies.filter((t) => t.tot.t > 0)
  const kh = toKhmerNumber
  const cell = (t: { t: number; f: number }) => tallyCell(t, kh)

  const rows: ReportRow[] = marked.map((t, i) => ({
    values: {
      'row.no': kh(i + 1),
      'row.name': t.label,
      'row.subject': t.label,
      'row.marked': cell(t.tot),
      'row.pass': cell(t.pass),
      'row.pass_abc': cell(t.passABC),
      'row.fail': cell(t.fail),
      'row.average': t.average === null ? null : Number(t.average.toFixed(2)),
    },
    subjectValues: letters.map((letter) => cell(t.grades[letter] ?? { t: 0, f: 0 })),
  }))

  return {
    payload: {
      scalars: {
        ...annualScalars(data, request.academicYear),
        'class.subjects': kh(marked.length),
      },
      subjects: columns,
      rows,
    },
    summary: {
      studentCount: data.students.length,
      subjectCount: marked.length,
      average: data.classAverage,
      periodLabel: data.periodLabel,
      className: data.base.className,
    },
  }
}

/**
 * `annual_promoted_students` / `annual_repeated_students` — សិស្សឡើងថ្នាក់ and
 * សិស្សត្រួតថ្នាក់.
 *
 * ONE resolver for both halves, for the reason `PromotionListClient` gives for
 * being one component: they are the two halves of a single partition, and a
 * pupil must appear on exactly one. With the predicate a parameter over the
 * canonical `annual.status`, that is true by construction rather than by two
 * comparison operators staying in step (§18).
 *
 * The threshold is `promotionThreshold(scheme)` — the pass mark
 * `/yearly-report` has always split on, read from the scheme rather than
 * restated (§17). A pupil with no annual result is `incomplete` and appears on
 * NEITHER list: treating a missing average as a fail would put an unmarked
 * class on the repeaters sheet (§36).
 */
async function resolvePromotionList(
  request: ReportRequest,
  status: 'promoted' | 'repeated',
): Promise<ResolvedReport | { error: string }> {
  const data = await resolveAnnualClass(request)
  if ('error' in data) return data

  const selected = byRank(data.students.filter((c) => c.annual.status === status))

  const rows: ReportRow[] = selected.map((c, i) => ({
    values: annualRowValues(c, i, data.base.scheme),
    subjectValues: [],
  }))

  const females = selected.filter((c) => isFemale(c.student.gender)).length
  const average = selected.length
    ? selected.reduce((a, c) => a + (c.annual.average ?? 0), 0) / selected.length
    : null

  return {
    payload: {
      scalars: {
        ...annualScalars(data, request.academicYear),
        'list.label': annualStatusLabel(status),
        'list.count': toKhmerNumber(selected.length),
        'list.female': toKhmerNumber(females),
        'list.average': average === null ? '' : Number(average.toFixed(2)),
        'list.rule': status === 'promoted'
          ? `មធ្យមភាគប្រចាំឆ្នាំចាប់ពី ${data.threshold.toFixed(2)} ឡើងទៅ`
          : `មធ្យមភាគប្រចាំឆ្នាំក្រោម ${data.threshold.toFixed(2)}`,
      },
      subjects: [],
      rows,
    },
    summary: {
      studentCount: selected.length,
      subjectCount: 0,
      average,
      periodLabel: data.periodLabel,
      className: data.base.className,
    },
  }
}

export function resolveAnnualPromoted(request: ReportRequest) {
  return resolvePromotionList(request, 'promoted')
}

export function resolveAnnualRepeated(request: ReportRequest) {
  return resolvePromotionList(request, 'repeated')
}

// ===========================================================================
// The record book (§22-§24)
// ===========================================================================

/**
 * `student_tracking_record_book` — សៀវភៅសិក្ខាគារិក.
 *
 * The only LONGITUDINAL report in the product (§23): not another score table
 * but one page per pupil carrying their whole year — every subject's two
 * semesters and annual figure, the absence tally split by semester, the four
 * behavioural assessments, and the year's outcome.
 *
 * WHAT THE LEGACY SCREEN GETS WRONG, AND THIS DOES NOT.
 * `/record-book` is kept working untouched (§29), but it carries two things a
 * new report may not (§6/§21):
 *
 *   - a HARD-CODED list of thirteen semester subjects, so a class that teaches
 *     anything else prints a form that does not describe it. Here the subjects
 *     come from the class's resolved score template narrowed by its selection,
 *     exactly as every other report resolves them.
 *   - its OWN month-to-semester split (`month >= 11 || month <= 3`), a second
 *     copy of the rule `lib/scores/calendar.ts` owns. Here the absence tally is
 *     bucketed by the class's own period calendar, so a school that collects on
 *     its own dates gets a booklet that agrees with its gradebook.
 *
 * Everything numeric is `resolveAnnualClass`'s, so a pupil's booklet, their
 * certificate and the class ranking cannot state three different averages.
 *
 * PAGE-ORIENTED, THEREFORE DOCX (§24). One A4 landscape page per pupil, the
 * subject table inside each page expanding with the class's curriculum through
 * `subjectDetail`.
 */
export async function resolveRecordBook(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  const data = await resolveAnnualClass(request)
  if ('error' in data) return data

  const supabase = await createClient()

  // Which calendar month belongs to which semester — the class's own calendar,
  // never a second split. `members` covers merged periods, so a school that
  // counts មីនា-មេសា as one period buckets its absences the same way.
  const calendar = await fetchScoreCalendar(data.base.scope, request.academicYear)
  // Keyed by the zero-padded month number, which is exactly the substring an
  // ISO `attendance.date` yields — no parsing, nothing to get wrong.
  const semesterByMonthNum = new Map<string, SemesterId>()
  for (const period of calendar) {
    for (const member of period.members) {
      const num = MONTH_NUM_BY_ID[member]
      if (num !== undefined) semesterByMonthNum.set(num, period.semester)
    }
  }

  // One query for the roster's attendance, not one per pupil (§41).
  const rosterIds = data.base.rosterIds
  let attendanceQuery = supabase.from('attendance').select('student_id, date, status')
  attendanceQuery = rosterIds
    ? attendanceQuery.in('student_id', rosterIds)
    : attendanceQuery.eq('teacher_id', data.base.teacherId)

  const { data: attendanceRows, error: attendanceError } = await attendanceQuery
  if (attendanceError) logger.error('resolveRecordBook attendance:', attendanceError)

  type Half = { excused: number; unexcused: number }
  const absences = new Map<string, { sem1: Half; sem2: Half }>()
  const half = (id: string, semester: SemesterId): Half => {
    const entry = absences.get(id)
      ?? { sem1: { excused: 0, unexcused: 0 }, sem2: { excused: 0, unexcused: 0 } }
    absences.set(id, entry)
    return entry[semester]
  }

  for (const row of (attendanceRows ?? []) as { student_id: string; date: string; status: string }[]) {
    // `AP` is an excused absence, `A` an unexcused one — the two statuses the
    // attendance feature writes. Anything else is a presence and is not tallied.
    if (row.status !== 'A' && row.status !== 'AP') continue
    const semester = semesterByMonthNum.get(row.date.slice(5, 7))
    // A date outside every configured period is counted in neither half rather
    // than being forced into one — an invented tally is worse than a gap.
    if (!semester) continue
    const bucket = half(row.student_id, semester)
    if (row.status === 'AP') bucket.excused += 1
    else bucket.unexcused += 1
  }

  const rows: ReportRow[] = data.students.map((c, i) => {
    const tally = absences.get(c.student.id)
      ?? { sem1: { excused: 0, unexcused: 0 }, sem2: { excused: 0, unexcused: 0 } }

    // The four behavioural assessments are WORDS, not marks — they live in
    // `score_text` and are read straight through, never averaged.
    const behaviour: Record<string, CellValue> = {}
    for (const key of BEHAVIOUR_KEYS) {
      const sem2 = c.scores.sem2[key]
      const sem1 = c.scores.sem1[key]
      const value = sem2 ?? sem1
      behaviour[`row.${key}`] = value === null || value === undefined ? '' : String(value)
    }

    const kh = toKhmerNumber

    return {
      values: {
        ...annualRowValues(c, i, data.base.scheme),
        ...behaviour,
        'row.absent_s1_excused': kh(tally.sem1.excused),
        'row.absent_s1_unexcused': kh(tally.sem1.unexcused),
        'row.absent_s2_excused': kh(tally.sem2.excused),
        'row.absent_s2_unexcused': kh(tally.sem2.unexcused),
        'row.absent_total': kh(
          tally.sem1.excused + tally.sem1.unexcused + tally.sem2.excused + tally.sem2.unexcused,
        ),
      },
      subjectValues: data.base.subjects.map((subject) => {
        const value = c.subjectAnnual[subject.key]
        return value === null || value === undefined ? null : Number(value.toFixed(2))
      }),
      // The per-page subject table: two semesters and the annual figure under
      // each subject, which a flat `subjectValues` row cannot express.
      subjectDetail: data.base.subjects.map((subject) => {
        const cell = (raw: number | string | null | undefined): CellValue => {
          if (raw === null || raw === undefined || raw === '') return '-'
          const value = Number(raw)
          return Number.isFinite(value) ? Number(value.toFixed(2)) : String(raw)
        }
        const annual = c.subjectAnnual[subject.key]
        return {
          sem1: cell(c.scores.sem1[subject.key]),
          sem2: cell(c.scores.sem2[subject.key]),
          annual: annual === null || annual === undefined ? '-' : Number(annual.toFixed(2)),
        }
      }),
    }
  })

  return {
    payload: {
      scalars: {
        ...annualScalars(data, request.academicYear),
        'book.title': 'សៀវភៅសិក្ខាគារិក',
        'book.provenance':
          'ទម្រង់សៀវភៅតាមដាននេះបង្កើតឡើងដោយ KruSmart — មិនមែនចម្លងផ្ទាល់ពីឯកសារផ្លូវការរបស់ក្រសួងទេ',
      },
      subjects: data.base.subjects,
      rows,
    },
    summary: {
      studentCount: data.students.length,
      subjectCount: data.base.subjects.length,
      average: data.classAverage,
      periodLabel: data.periodLabel,
      className: data.base.className,
    },
  }
}

/**
 * Who the certificate flow may offer, and what to say about each of them.
 *
 * Exists so the picker cannot invent its own idea of eligibility. It returns
 * the WHOLE assessed roster with each pupil's canonical average, placing and
 * status, and marks which ones the default rule would select — rather than
 * returning only the eligible ones and leaving the screen to guess why someone
 * is missing. A teacher who wants to certify a pupil the default excludes can
 * then do so deliberately, which is a judgement the product should allow and
 * `resolveCertificate` already honours through `studentIds`.
 *
 * Same scope and RLS path as every other resolver — it is `resolveAnnualClass`
 * with a projection, not a second query (§41).
 */
export interface CertificateCandidate {
  id: string
  name: string
  gender: string
  average: number | null
  rank: number
  status: AnnualStatus
  statusLabel: string
  /** True when the default cohort — the pupils who passed — includes them. */
  eligible: boolean
}

export async function resolveCertificateCandidates(
  request: ReportRequest,
): Promise<{ candidates: CertificateCandidate[]; className: string } | { error: string }> {
  const data = await resolveAnnualClass(request)
  if ('error' in data) return data

  // A pupil with no result at all is not offered: there is no placing to
  // certify, and listing them would invite a certificate asserting one (§36).
  const assessed = byRank(data.students.filter((c) => c.annual.status !== 'incomplete'))

  return {
    className: data.base.className,
    candidates: assessed.map((c) => ({
      id: c.student.id,
      name: c.student.name_kh || c.student.name_en || '',
      gender: c.student.gender ?? '',
      average: c.annual.average === null ? null : Number(c.annual.average.toFixed(2)),
      rank: c.rank,
      status: c.annual.status,
      statusLabel: annualStatusLabel(c.annual.status),
      eligible: c.annual.status === 'promoted',
    })),
  }
}

/**
 * Dispatch to a report's resolver.
 *
 * One `switch`, and every unmigrated report falls through it with an honest
 * message rather than a half-built document. §27's incremental migration lives
 * here: a report moves onto the engine by gaining a case and flipping `engine`
 * in its definition, and nothing else in the product changes.
 */
export async function resolveReport(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
  switch (request.reportType) {
    case 'score_monthly':
      return resolveScoreMonthly(request)
    case 'ranking_monthly':
      return resolveRankingMonthly(request)
    case 'score_semester':
      return resolveScoreSemester(request)
    case 'ranking_semester':
      return resolveRankingSemester(request)
    case 'honor':
      return resolveHonor(request)
    case 'ranking_annual':
      return resolveRankingAnnual(request)
    case 'certificate':
      return resolveCertificate(request)
    case 'annual_summary':
      return resolveAnnualSummary(request)
    case 'annual_monthly_ranking':
      return resolveAnnualMonthlyRanking(request)
    case 'annual_monthly_average':
      return resolveAnnualMonthlyAverage(request)
    case 'annual_subject':
      return resolveAnnualSubject(request)
    case 'annual_subject_results':
      return resolveAnnualSubjectResults(request)
    case 'annual_promoted_students':
      return resolveAnnualPromoted(request)
    case 'annual_repeated_students':
      return resolveAnnualRepeated(request)
    case 'student_tracking_record_book':
      return resolveRecordBook(request)
    default:
      return { error: 'របាយការណ៍នេះមិនទាន់ប្រើប្រព័ន្ធបង្កើតឯកសាររួមនៅឡើយទេ' }
  }
}
