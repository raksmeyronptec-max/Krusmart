import 'server-only'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import {
  classIdFromSearchParams,
  fetchScoreCalendar,
  fetchStudentsForScope,
  resolveServerGradingContext,
  resolveServerScope,
  rosterIdsForScope,
} from '@/lib/utils/serverScope'
import {
  deriveSemesterAverages, promotionThreshold,
  type DerivedSemesters, type ExamMark,
} from '@/lib/scores/annual'
import {
  monthIdFromPeriod, monthlyAveragesByStudent, type MonthlyMark,
} from '@/lib/scores/aggregate'
import { periodKeysForSemester } from '@/lib/scores/calendar'
import { scoreNumericValue } from '@/lib/utils/score-value'
import { logger } from '@/lib/utils/logger'
import type { Score, Settings, Student } from '@/lib/types'

export interface AnnualReportData {
  students: Student[]
  annualScores: Score[]
  settings: Settings | null
  academicYear: string
  /**
   * Each pupil's two semester figures, derived from their marks.
   *
   * Nothing in this application writes an annual row, so without these the
   * promotion list named nobody and the repeat list named the whole class —
   * see the header of `lib/reports/annual.ts`.
   */
  derived: DerivedSemesters
  /** The class's own pass mark, not primary's 5.00 restated. */
  threshold: number
}

/**
 * Roster, annual marks and letterhead for the yearly sub-reports.
 *
 * All three fetch exactly the same things, so the loader lives here rather than
 * being pasted into each page — and any change to the scoping rules lands on all
 * three at once.
 */
export async function loadAnnualReportData(
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
): Promise<AnnualReportData> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', user.id)
    .maybeSingle()

  const academicYear = settings?.academic_year || getCurrentAcademicYear()

  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  const students = await fetchStudentsForScope(scope)

  // Scored by roster rather than ownership, per migration 00007: a teacher
  // assigned to the class reads every subject's marks for it, including those a
  // colleague entered. Legacy accounts fall back to `teacher_id`.
  const rosterIds = await rosterIdsForScope(scope)

  let query = supabase
    .from('scores')
    .select('*')
    .eq('score_type', 'annual')
    .eq('score_period', `annual-${academicYear}`)

  query = rosterIds ? query.in('student_id', rosterIds) : query.eq('teacher_id', user.id)

  const { data: annualScores, error } = await query
  if (error) logger.error('Failed to load annual scores:', error)

  /*
   * ── The derived year ──────────────────────────────────────────────────
   *
   * Three more reads, made here rather than in the client because this loader
   * already holds the scope and all three sub-reports need the same answer.
   * They are the exact inputs `deriveSemesterAverages` takes: both semesters'
   * exam marks, and the year's monthly marks for the coursework half.
   *
   * Everything is delegated — the composition is the shared one `/score/total`
   * and `resolveAnnualClass` use, and the month split is the class's own
   * calendar rather than a compiled-in list.
   */
  const scoredQuery = () => supabase.from('scores').select('*')
  const scoped = <T extends { in: (c: string, v: string[]) => T; eq: (c: string, v: string) => T }>(q: T): T =>
    rosterIds ? q.in('student_id', rosterIds) : q.eq('teacher_id', user.id)

  const [grading, calendar, sem1Res, sem2Res, monthlyRes] = await Promise.all([
    resolveServerGradingContext(user.id, requestedClassId, 'semester'),
    fetchScoreCalendar(scope, academicYear),
    scoped(scoredQuery().eq('score_type', 'semester').eq('score_period', `sem1-${academicYear}`)),
    scoped(scoredQuery().eq('score_type', 'semester').eq('score_period', `sem2-${academicYear}`)),
    scoped(scoredQuery().eq('score_type', 'monthly').like('score_period', `%-${academicYear}`)),
  ])

  const monthlyGrading = await resolveServerGradingContext(user.id, requestedClassId, 'monthly')

  const examMarks = (rows: Score[] | null): ExamMark[] => {
    const out: ExamMark[] = []
    for (const r of rows ?? []) {
      const v = scoreNumericValue(r)
      if (v === null) continue
      out.push({
        studentId: r.student_id,
        score: v,
        maxScore: grading.maxByColumn[r.subject] ?? grading.scheme.maxScore,
      })
    }
    return out
  }

  const monthlyMarks: MonthlyMark[] = []
  for (const r of (monthlyRes.data ?? []) as Score[]) {
    const v = scoreNumericValue(r)
    if (v === null) continue
    const monthId = monthIdFromPeriod(r.score_period, academicYear)
    if (monthId === null) continue
    monthlyMarks.push({
      studentId: r.student_id,
      monthId,
      score: v,
      maxScore: monthlyGrading.maxByColumn[r.subject] ?? monthlyGrading.scheme.maxScore,
    })
  }

  const derived = deriveSemesterAverages({
    studentIds: (students ?? []).map((s) => s.id),
    sem1Exams: examMarks(sem1Res.data as Score[] | null),
    sem2Exams: examMarks(sem2Res.data as Score[] | null),
    monthlyAverages: monthlyAveragesByStudent(monthlyMarks, monthlyGrading.scheme),
    sem1Months: periodKeysForSemester(calendar, 'sem1'),
    sem2Months: periodKeysForSemester(calendar, 'sem2'),
    scheme: grading.scheme,
  })

  return {
    students: students || [],
    annualScores: (annualScores || []) as Score[],
    settings: settings || null,
    academicYear,
    derived,
    threshold: promotionThreshold(grading.scheme),
  }
}

// Period-scoped reads for the subject-results breakdown go through
// `getAllScoresByPeriod` in `score/total/actions.ts` — it already applies
// exactly this scoping, and a second copy here would be one more thing to keep
// in step with migration 00007.
