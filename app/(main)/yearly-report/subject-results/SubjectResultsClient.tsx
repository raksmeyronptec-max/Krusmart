'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx-js-style'
import ReportFrame from '../ReportFrame'
import Select from '@/components/ui/forms/Select'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { getAllScoresByPeriod } from '../../score/total/actions'
import { MONTHS_BY_ACADEMIC_YEAR } from '@/lib/constants/months'
import { MONTHLY_SUBJECT_KEYS, SEMESTER_SUBJECT_KEYS, subjectLabel } from '@/lib/constants/subjects'
import { DEFAULT_SCHEME_CONFIG } from '@/lib/grading/scheme'
import {
  schemeLetters, tallyCell, tallySubject, type SubjectTally, type Tally,
} from '@/lib/scores/subject-results'
import { useScoreTemplate } from '@/lib/hooks/useScoreTemplate'
import { maxScoreByColumn } from '@/lib/scores/template'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { Score, Settings, Student } from '@/lib/types'
import { useActiveClass } from '@/lib/hooks/useActiveClass'

type Mode = 'monthly' | 'semester'

/**
 * The tally rule moved to `lib/scores/subject-results.ts` so the printed
 * `annual_subject_results` report and this screen share one definition of
 * "ជាប់មធ្យមភាគ" (§16). `Tally`, the two fractions, the letter ordering and
 * the per-subject loop all live there now; this screen renders what it returns.
 */
type SubjectRow = SubjectTally

/** Letters in report order, taken from the shared scheme so the two agree. */
const LETTERS = schemeLetters(DEFAULT_SCHEME_CONFIG)

/** `៣០ (១២)` — total with the female count in brackets. */
function cell(tally: Tally): string {
  return tallyCell(tally, toKhmerNumber)
}

/**
 * Grade distribution per subject, for a month or a semester.
 *
 * Restores `reports/annual/subject-results.html`. The one behaviour worth
 * preserving explicitly: a pupil with no mark in a subject is *skipped*, not
 * counted as an F. The legacy file carries a fix comment saying exactly that —
 * counting blanks had been reporting whole classes as failing subjects nobody
 * had entered yet.
 */
export function SubjectResultsClient({
  students,
  settings,
  academicYear,
}: {
  students: Student[]
  settings: Settings | null
  academicYear: string
}) {
  /*
   * The class every mark below is fetched for.
   *
   * `getAllScoresByPeriod` resolves the caller's *default* class when it is not
   * told which one — so a teacher holding two classes saw this screen's roster
   * (resolved from `?class=` by the page) beside the other class's marks. The
   * page and the fetch have to name the same class.
   *
   * `?? undefined` keeps a pre-V2 account on `teacher_id` scoping, unchanged.
   */
  const scopeClassId = useActiveClass().classId ?? undefined
  // One grading resolution for the whole report; the tally loop below is pure.
  const { subjects: templateSubjects, scheme } = useScoreTemplate('monthly')
  const maxByColumn = useMemo(() => maxScoreByColumn(templateSubjects), [templateSubjects])

  const [mode, setMode] = useState<Mode>('monthly')
  const [month, setMonth] = useState<string>(MONTHS_BY_ACADEMIC_YEAR[0].id)
  const [semester, setSemester] = useState('sem1')
  const [scores, setScores] = useState<Score[]>([])
  const [loading, setLoading] = useState(true)

  const femaleIds = useMemo(
    () => new Set(students.filter((s) => s.gender === 'ស្រី' || s.gender === 'F').map((s) => s.id)),
    [students],
  )

  const period = mode === 'monthly' ? `${month}-${academicYear}` : `${semester}-${academicYear}`

  const load = useCallback(async () => {
    setLoading(true)
    const rows = await getAllScoresByPeriod(mode, period, scopeClassId)
    setScores(rows)
    setLoading(false)
  }, [mode, period, scopeClassId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously during the effect
    load()
  }, [load])

  const rows = useMemo<SubjectRow[]>(() => {
    const keys = mode === 'monthly' ? MONTHLY_SUBJECT_KEYS : SEMESTER_SUBJECT_KEYS
    const byKey = new Map<string, Score[]>()

    for (const s of scores) {
      const list = byKey.get(s.subject)
      if (list) list.push(s)
      else byKey.set(s.subject, [s])
    }

    const out: SubjectRow[] = []

    for (const key of keys) {
      const entries = byKey.get(key) ?? []

      const values = entries.flatMap((entry) => {
        if (entry.score_value === null || entry.score_value === undefined
          || String(entry.score_value) === '') return []
        const val = Number.parseFloat(String(entry.score_value))
        if (!Number.isFinite(val)) return []
        return [{ value: val, female: femaleIds.has(entry.student_id) }]
      })

      const row = tallySubject(
        key, subjectLabel(key), values, maxByColumn[key] ?? scheme.maxScore, scheme,
      )

      // A subject nobody has been marked in is left off entirely rather than
      // printed as a row of zeroes — the legacy report did the same.
      if (row.tot.t > 0) out.push(row)
    }

    return out
  }, [scores, mode, femaleIds, scheme, maxByColumn])

  const exportExcel = () => {
    const header = [
      'ល.រ', 'មុខវិជ្ជា', 'សិស្សសរុប',
      ...LETTERS.map((l) => `និទ្ទេស ${l}`),
      'ជាប់មធ្យមភាគ', 'ជាប់និទ្ទេស ABC', 'ធ្លាក់មធ្យមភាគ',
    ]

    const body = rows.map((r, i) => [
      i + 1,
      r.label,
      `${r.tot.t} (${r.tot.f})`,
      ...LETTERS.map((l) => `${r.grades[l].t} (${r.grades[l].f})`),
      `${r.pass.t} (${r.pass.f})`,
      `${r.passABC.t} (${r.passABC.f})`,
      `${r.fail.t} (${r.fail.f})`,
    ])

    const ws = XLSX.utils.aoa_to_sheet([
      ['លទ្ធផលសិក្សាតាមមុខវិជ្ជា'],
      [`ឆ្នាំសិក្សា ${academicYear} · ${periodLabel(mode, month, semester)}`],
      ['តួលេខក្នុងវង់ក្រចកគឺចំនួនសិស្សស្រី'],
      [],
      header,
      ...body,
    ])
    ws['!cols'] = [{ wch: 5 }, { wch: 24 }, ...Array(LETTERS.length + 4).fill({ wch: 12 })]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'លទ្ធផលមុខវិជ្ជា')
    XLSX.writeFile(wb, `លទ្ធផលតាមមុខវិជ្ជា_${academicYear}.xlsx`)
  }

  return (
    <ReportFrame
      settings={settings}
      academicYear={academicYear}
      title="លទ្ធផលសិក្សាតាមមុខវិជ្ជា"
      subtitle={`${periodLabel(mode, month, semester)} · តួលេខក្នុងវង់ក្រចកគឺចំនួនសិស្សស្រី`}
      onExport={rows.length > 0 ? exportExcel : undefined}
      summary={<p>មុខវិជ្ជាដែលមានពិន្ទុ {toKhmerNumber(rows.length)} · សិស្សសរុប {toKhmerNumber(students.length)} នាក់</p>}
      controls={
        <>
          <Select
            ariaLabel="ប្រភេទរបាយការណ៍"
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            options={[
              { value: 'monthly', label: 'ប្រចាំខែ' },
              { value: 'semester', label: 'ប្រចាំឆមាស' },
            ]}
          />
          {mode === 'monthly' ? (
            <Select
              ariaLabel="ខែ"
              value={month}
              onChange={setMonth}
              options={MONTHS_BY_ACADEMIC_YEAR.map((m) => ({ value: m.id, label: m.label }))}
            />
          ) : (
            <Select
              ariaLabel="ឆមាស"
              value={semester}
              onChange={setSemester}
              options={[
                { value: 'sem1', label: 'ឆមាសទី១' },
                { value: 'sem2', label: 'ឆមាសទី២' },
              ]}
            />
          )}
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center p-10">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10">
          <EmptyState
            title="មិនទាន់មានពិន្ទុសម្រាប់ដំណាក់កាលនេះ"
            description="សូមជ្រើសរើសខែ ឬឆមាសផ្សេង ឬបញ្ចូលពិន្ទុជាមុនសិន។"
          />
        </div>
      ) : (
        <table className="report-table">
          <thead>
            <tr>
              <th rowSpan={2} className="w-12">ល.រ</th>
              <th rowSpan={2} className="text-left">មុខវិជ្ជា</th>
              <th rowSpan={2} className="w-24">សិស្សសរុប</th>
              <th colSpan={LETTERS.length}>និទ្ទេស</th>
              <th rowSpan={2} className="w-24">ជាប់មធ្យមភាគ</th>
              <th rowSpan={2} className="w-24">ជាប់និទ្ទេស ABC</th>
              <th rowSpan={2} className="w-24">ធ្លាក់មធ្យមភាគ</th>
            </tr>
            <tr>
              {LETTERS.map((l) => (
                <th key={l} className="w-16">{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td className="text-center">{toKhmerNumber(i + 1)}</td>
                <td className="font-bold">{r.label}</td>
                <td className="text-center">{cell(r.tot)}</td>
                {LETTERS.map((l) => (
                  <td key={l} className="text-center">{cell(r.grades[l])}</td>
                ))}
                <td className="text-center font-bold text-success">{cell(r.pass)}</td>
                <td className="text-center">{cell(r.passABC)}</td>
                <td className="text-center font-bold text-danger">{cell(r.fail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReportFrame>
  )
}

function periodLabel(mode: Mode, month: string, semester: string): string {
  if (mode === 'semester') return semester === 'sem1' ? 'ឆមាសទី១' : 'ឆមាសទី២'
  return `ខែ${MONTHS_BY_ACADEMIC_YEAR.find((m) => m.id === month)?.label ?? ''}`
}

export default SubjectResultsClient
