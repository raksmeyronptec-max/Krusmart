import 'server-only'

import { createClient } from '@/lib/supabase/server'
import {
  fetchClassSelection,
  fetchScoreTemplate,
  fetchStudentsForScope,
  resolveServerScope,
  rosterIdsForScope,
} from '@/lib/utils/serverScope'
import { resolveTemplate } from '@/lib/scores/template'
import { applySelection } from '@/lib/scores/selection'
import { assignRanks, numericColumnKeys, studentAverage } from '@/lib/scores/aggregate'
import { schemeForLevel } from '@/lib/grading/levelSchemes'
import { gradeFor } from '@/lib/grading/scheme'
import { scoreCellValue } from '@/lib/utils/score-value'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { MONTH_LABEL_BY_ID } from '@/lib/constants/months'
import {
  isSemesterId, monthlyComponent, monthsForSemester, semesterAverage, semesterLabel,
  type SemesterId,
} from '@/lib/scores/semester'
import {
  defaultHonorCriteria, evaluateHonor, HONOR_CRITERIA_PROVENANCE,
} from '@/lib/scores/honor'
import { logger } from '@/lib/utils/logger'
import type { Score, Settings, Student } from '@/lib/types'
import type { ReportPayload, ReportRow, ReportSubjectColumn } from './report-mapper'
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
 * `semesterAverage` and `monthsForSemester` in `lib/scores/semester.ts` are the
 * definitions `/score/total` itself now uses, so the printed sheet and the
 * screen cannot disagree (§4/§23).
 *
 * A semester average is half exam, half coursework. Note the deliberate
 * asymmetry inherited from `/score/total`: a *missing subject* inside either
 * half is skipped, but a *missing half* counts as zero — a pupil who sat the
 * exam and has no monthly marks scores half what they wrote. That is the
 * product's existing definition, preserved rather than improved (§8).
 */
export async function resolveRankingSemester(
  request: ReportRequest,
): Promise<ResolvedReport | { error: string }> {
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

  const months = monthsForSemester(semester)

  const computed = base.students.map((c) => {
    const monthly = monthlyComponent(monthlyAverages[c.student.id], months)
    // `c.average` here is the EXAM half — `resolveMonthlyClass` averaged the
    // semester score rows. The semester average combines it with coursework.
    const average = semesterAverage(c.average, monthly)
    return { ...c, examAverage: c.average, monthly, average, rank: 0 }
  })

  // Canonical competition ranking: ties share a rank, the next rank skips (§9).
  assignRanks([...computed], (r) => r.average ?? 0, (r, rank) => { r.rank = rank })

  const ordered = [...computed].sort((a, b) => {
    const aMarked = a.average !== null
    const bMarked = b.average !== null
    if (aMarked !== bMarked) return aMarked ? -1 : 1
    if (a.rank !== b.rank) return a.rank - b.rank
    return String(a.student.name_kh ?? '').localeCompare(String(b.student.name_kh ?? ''), 'km')
  })

  const rows: ReportRow[] = ordered.map((c, i) => {
    const average = c.average
    const grade = average === null ? null : gradeFor(average, base.scheme)

    return {
      values: {
        'row.no': toKhmerNumber(i + 1),
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
          : average >= base.scheme.passMark ? 'ជាប់' : 'ធ្លាក់',
      },
      subjectValues: base.subjects.map((subject) => {
        const raw = c.scores[subject.key]
        if (raw === null || raw === undefined || raw === '') return null
        const value = Number(raw)
        return Number.isFinite(value) ? value : String(raw)
      }),
    }
  })

  const marked = computed.filter((c) => c.average !== null)
  const passed = marked.filter((c) => (c.average ?? 0) >= base.scheme.passMark).length
  const classAverage = marked.length
    ? marked.reduce((a, c) => a + (c.average ?? 0), 0) / marked.length
    : null

  const periodLabel = `${semesterLabel(semester)} ឆ្នាំសិក្សា ${request.academicYear}`

  return {
    payload: {
      scalars: {
        ...headerScalars(base, request.academicYear),
        'period.label': periodLabel,
        'period.semester': semesterLabel(semester),
        'class.average': classAverage === null ? '' : Number(classAverage.toFixed(2)),
        'class.scored': toKhmerNumber(marked.length),
        'class.passed': toKhmerNumber(passed),
        'class.failed': toKhmerNumber(marked.length - passed),
        'class.passmark': toKhmerNumber(base.scheme.passMark),
        'class.months': toKhmerNumber(months.length),
      },
      subjects: base.subjects,
      rows,
    },
    summary: {
      studentCount: base.students.length,
      subjectCount: base.subjects.length,
      average: classAverage,
      periodLabel,
      className: base.className,
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
    case 'ranking_semester':
      return resolveRankingSemester(request)
    case 'honor':
      return resolveHonor(request)
    default:
      return { error: 'របាយការណ៍នេះមិនទាន់ប្រើប្រព័ន្ធបង្កើតឯកសាររួមនៅឡើយទេ' }
  }
}
