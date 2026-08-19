'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx-js-style'
import ReportFrame from '../ReportFrame'
import Select from '@/components/ui/forms/Select'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { getAllScoresByPeriod } from '../../score/total/actions'
import { MONTHS_BY_ACADEMIC_YEAR } from '@/lib/constants/months'
import { MONTHLY_SUBJECT_KEYS, SEMESTER_SUBJECT_KEYS, subjectLabel } from '@/lib/constants/subjects'
import { DEFAULT_SCHEME_CONFIG, gradeFor } from '@/lib/grading/scheme'
import { useScoreTemplate } from '@/lib/hooks/useScoreTemplate'
import { maxScoreByColumn } from '@/lib/scores/template'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { Score, Settings, Student } from '@/lib/types'

type Mode = 'monthly' | 'semester'

/** Total / female pair, which is how every ministry tally is reported. */
interface Tally {
  t: number
  f: number
}

interface SubjectRow {
  key: string
  label: string
  tot: Tally
  grades: Record<string, Tally>
  pass: Tally
  passABC: Tally
  fail: Tally
}

/**
 * A pupil passes a subject at half its full mark, and reaches the A–C band at
 * 70% of it — the same two fractions the scheme's own pass mark and C band
 * encode. Expressed as fractions rather than the literal 5.0 / 7.0 so a
 * subject marked out of 75 is judged at 37.5 / 52.5 instead of being called a
 * pass on a /10 yardstick.
 */
const PASS_FRACTION = 0.5
const ABC_FRACTION = 0.7

/** Letters in report order, taken from the shared scheme so the two agree. */
const LETTERS = [...DEFAULT_SCHEME_CONFIG.bands]
  .sort((a, b) => b.min - a.min)
  .map((b) => b.letter)

const emptyTally = (): Tally => ({ t: 0, f: 0 })

function bump(tally: Tally, isFemale: boolean) {
  tally.t++
  if (isFemale) tally.f++
}

/** `៣០ (១២)` — total with the female count in brackets. */
function cell(tally: Tally): string {
  return `${toKhmerNumber(tally.t)} (${toKhmerNumber(tally.f)})`
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
    const rows = await getAllScoresByPeriod(mode, period)
    setScores(rows)
    setLoading(false)
  }, [mode, period])

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

      const row: SubjectRow = {
        key,
        label: subjectLabel(key),
        tot: emptyTally(),
        grades: Object.fromEntries(LETTERS.map((l) => [l, emptyTally()])),
        pass: emptyTally(),
        passABC: emptyTally(),
        fail: emptyTally(),
      }

      for (const entry of entries) {
        if (entry.score_value === null || entry.score_value === undefined || String(entry.score_value) === '') continue
        const val = Number.parseFloat(String(entry.score_value))
        if (!Number.isFinite(val)) continue

        const isFemale = femaleIds.has(entry.student_id)

        bump(row.tot, isFemale)

        // A per-subject mark, graded on that subject's own scale.
        const letter = gradeFor(val, scheme, maxByColumn[key] ?? scheme.maxScore)?.letter
        if (letter && row.grades[letter]) bump(row.grades[letter], isFemale)

        const subjectMax = maxByColumn[key] ?? scheme.maxScore
        if (val >= subjectMax * PASS_FRACTION) bump(row.pass, isFemale)
        else bump(row.fail, isFemale)

        if (val >= subjectMax * ABC_FRACTION) bump(row.passABC, isFemale)
      }

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
