'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/actions/Button'
import Link from 'next/link'
import { ArrowLeft, FileSpreadsheet, Loader2, Printer } from 'lucide-react'
import Select from '@/components/ui/forms/Select'
import { getAllScoresByPeriod } from '../total/actions'
import { ACADEMIC_MONTH_OPTIONS_BY_ID } from '@/lib/constants/months'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { gradeFor } from '@/lib/grading/scheme'
import { useScoreTemplate } from '@/lib/hooks/useScoreTemplate'
import { maxScoreByColumn } from '@/lib/scores/template'
import { studentAverage } from '@/lib/scores/aggregate'
import { scoreCellValue, scoreNumericValue } from '@/lib/utils/score-value'
import type { Score, Settings, Student } from '@/lib/types'

/**
 * តារាងពិន្ទុតាមទម្រង់ក្រសួង — the ministry's printable score sheet.
 *
 * The legacy build produced this from two pages: one that asked for the school
 * header and the class statistics by hand, and one that rendered the table. Both
 * numbers are already in the database here, so the header is filled from
 * `settings` and the statistics are counted from the roster.
 */

/** Subjects that carry a numeric mark, per score type. */
const MONTHLY_SUBJECTS = [
  'kh_listen', 'kh_speak', 'kh_read', 'kh_write', 'kh_calligraphy', 'kh_recitation', 'kh_essay',
  'math_num', 'math_meas', 'math_geo', 'math_alg', 'math_stat',
  'sci_phy', 'sci_chem', 'sci_bio', 'sci_earth', 'sci_applied',
  'soc_ethic', 'soc_geo', 'soc_hist', 'soc_home',
  'pe_sport', 'health_hygiene', 'life_skill', 'foreign',
]

const SEMESTER_SUBJECTS = [
  'sem_kh_reading', 'sem_kh_listening_speaking', 'sem_kh_dictation', 'sem_kh_essay',
  'sem_math', 'sem_science', 'sem_moral_civics', 'sem_geo', 'sem_hist', 'sem_home_arts',
  'sem_life_skills', 'sem_foreign', 'sem_sport',
]

/** Section អាកប្បកិរិយា — words, not marks, so they sit outside the average. */
const BEHAVIOUR_SUBJECTS = [
  'sem_eval_knowledge', 'sem_eval_skill', 'sem_eval_moral', 'sem_eval_participate',
]

interface PrintRow {
  student: Student
  total: number
  scored: number
  average: number | null
  letter: string
  label: string
  behaviour: string
  rank: number
}

export default function ScorePrintClient({
  initialStudents,
  settings,
  academicYear,
}: {
  initialStudents: Student[]
  settings: Settings | null
  academicYear: string
}) {
  // One grading resolution for the whole sheet; the row loop below is pure.
  const { subjects: templateSubjects, scheme } = useScoreTemplate('monthly')
  const maxByColumn = useMemo(() => maxScoreByColumn(templateSubjects), [templateSubjects])

  const [mode, setMode] = useState<'monthly' | 'semester'>('monthly')
  const [month, setMonth] = useState('nov')
  const [semester, setSemester] = useState('sem1')
  const [scores, setScores] = useState<Score[]>([])
  const [loading, setLoading] = useState(true)

  const period = mode === 'monthly' ? `${month}-${academicYear}` : `${semester}-${academicYear}`

  const load = useCallback(async () => {
    setLoading(true)
    setScores(await getAllScoresByPeriod(mode, period))
    setLoading(false)
  }, [mode, period])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously during the effect
    load()
  }, [load])

  const rows: PrintRow[] = useMemo(() => {
    const subjects = mode === 'monthly' ? MONTHLY_SUBJECTS : SEMESTER_SUBJECTS
    const wanted = new Set(subjects)

    const byStudent = new Map<string, { marks: Record<string, number>; behaviour: string[] }>()
    for (const s of initialStudents) byStudent.set(s.id, { marks: {}, behaviour: [] })

    for (const row of scores) {
      const entry = byStudent.get(row.student_id)
      if (!entry) continue

      if (wanted.has(row.subject)) {
        // Behavioural rows have no numeric value and must not drag the average
        // down; `scoreNumericValue` returns null for them.
        const value = scoreNumericValue(row)
        if (value !== null) entry.marks[row.subject] = value
      } else if (BEHAVIOUR_SUBJECTS.includes(row.subject)) {
        const text = scoreCellValue(row)
        if (typeof text === 'string' && text) entry.behaviour.push(text)
      }
    }

    const computed = initialStudents.map((student) => {
      const e = byStudent.get(student.id) ?? { marks: {}, behaviour: [] }
      // Shared aggregation on the class's scheme — the ministry sheet must
      // print the same average and letter as every other surface.
      const { average, total } = studentAverage(e.marks, subjects, maxByColumn, scheme)
      const result = gradeFor(average, scheme)

      // The sheet shows one overall conduct word: the most frequent of the four.
      const tally = new Map<string, number>()
      for (const b of e.behaviour) tally.set(b, (tally.get(b) ?? 0) + 1)
      const behaviour = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-'

      return {
        student,
        total,
        scored: Object.keys(e.marks).length,
        average,
        letter: result?.letter ?? '-',
        label: result?.label ?? '-',
        behaviour,
        rank: 0,
      }
    })

    // Rank by average, students with no marks last; equal averages share a rank.
    computed.sort((a, b) => (b.average ?? -1) - (a.average ?? -1))
    let rank = 0
    let previous: number | null = Number.NaN
    computed.forEach((row, i) => {
      if (row.average !== previous) {
        rank = i + 1
        previous = row.average
      }
      row.rank = row.average === null ? 0 : rank
    })

    return computed
  }, [initialStudents, scores, mode, scheme, maxByColumn])

  const stats = useMemo(() => {
    const female = initialStudents.filter((s) => s.gender === 'ស្រី' || s.gender === 'Female').length
    const marked = rows.filter((r) => r.average !== null)
    const below = marked.filter((r) => (r.average ?? 0) < scheme.passMark).length
    const failing = marked.filter((r) => r.letter === 'F').length
    const classAvg = marked.length
      ? marked.reduce((sum, r) => sum + (r.average ?? 0), 0) / marked.length
      : null
    return { total: initialStudents.length, female, male: initialStudents.length - female, below, failing, classAvg }
  }, [initialStudents, rows, scheme.passMark])

  const periodLabel =
    mode === 'monthly'
      ? `ខែ ${ACADEMIC_MONTH_OPTIONS_BY_ID.find((o) => o.value === month)?.label ?? month}`
      : semester === 'sem1' ? 'ឆមាសទី១' : 'ឆមាសទី២'

  const exportExcel = async () => {
    const XLSX = await import('xlsx-js-style')
    const sheet = XLSX.utils.aoa_to_sheet([
      ['ល.រ', 'គោត្តនាម និងនាម', 'ភេទ', 'ពិន្ទុសរុប', 'មធ្យមភាគ', 'និទ្ទេស', 'ចំណាត់ថ្នាក់', 'អាកប្បកិរិយា'],
      ...rows.map((r, i) => [
        i + 1,
        r.student.name_kh,
        r.student.gender ?? '',
        r.total,
        r.average === null ? '' : Number(r.average.toFixed(2)),
        r.letter,
        r.rank || '',
        r.behaviour,
      ]),
    ])
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'ពិន្ទុ')
    XLSX.writeFile(book, `score-${period}.xlsx`)
  }

  return (
    <div className="min-h-screen font-battambang print:bg-bg-surface">
      <style jsx global>{`
        .print-container { display: none; }
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { background: #fff !important; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-container { display: block !important; width: 100%; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
          .moeys-table th { background-color: #f3f4f6 !important; }
          .moeys-table tr { break-inside: avoid; }
          thead { display: table-header-group; }
        }
        .moeys-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
        .moeys-table th, .moeys-table td { border: 1px solid #000; padding: 3px 5px; text-align: center; }
        .moeys-table th { font-family: 'Moul', cursive; font-weight: normal; font-size: 9pt; }
      `}</style>

      {/* ---------------------------------------------------------------- UI */}
      <div className="no-print mx-auto max-w-5xl px-4 py-6 md:py-8">
        <Link
          href="/score/total"
          className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-bg-surface/60 px-4 py-2 font-bold text-brand shadow-sm backdrop-blur-sm transition hover:text-brand-800"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" /> ត្រឡប់ទៅតារាងពិន្ទុ
        </Link>

        <div className="rounded-xl border border-divider bg-bg-surface p-6 shadow-lg md:p-8">
          <h1 className="kh-moul mb-6 border-b border-divider pb-4 text-xl text-brand md:text-2xl dark:text-brand-300">
            តារាងពិន្ទុតាមទម្រង់ក្រសួង
          </h1>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sp-mode" className="mb-1.5 block text-sm font-bold text-text-body">ប្រភេទ</label>
              <Select
                id="sp-mode"
                ariaLabel="ប្រភេទពិន្ទុ"
                value={mode}
                onChange={(v) => setMode(v as 'monthly' | 'semester')}
                options={[
                  { value: 'monthly', label: 'ប្រចាំខែ' },
                  { value: 'semester', label: 'ប្រចាំឆមាស' },
                ]}
              />
            </div>
            <div>
              <label htmlFor="sp-period" className="mb-1.5 block text-sm font-bold text-text-body">
                {mode === 'monthly' ? 'ខែ' : 'ឆមាស'}
              </label>
              {mode === 'monthly' ? (
                <Select id="sp-period" ariaLabel="ខែ" value={month} onChange={setMonth} options={ACADEMIC_MONTH_OPTIONS_BY_ID} />
              ) : (
                <Select
                  id="sp-period"
                  ariaLabel="ឆមាស"
                  value={semester}
                  onChange={setSemester}
                  options={[
                    { value: 'sem1', label: 'ឆមាសទី១' },
                    { value: 'sem2', label: 'ឆមាសទី២' },
                  ]}
                />
              )}
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ['សិស្សសរុប', stats.total],
              ['ប្រុស', stats.male],
              ['ស្រី', stats.female],
              ['ក្រោមមធ្យមភាគ', stats.below],
            ] as const).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-divider bg-bg-surface p-3 text-center">
                <p className="mb-1 text-xs font-bold text-text-muted">{label}</p>
                <p className="text-xl font-bold text-brand dark:text-brand-300">{toKhmerNumber(value)}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="danger" printHidden={false} onClick={() => window.print()}
              disabled={loading || rows.length === 0}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Printer className="h-4 w-4" aria-hidden="true" />}
              បោះពុម្ព
            </Button>
            <Button variant="success" printHidden={false} onClick={exportExcel}
              disabled={loading || rows.length === 0}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> នាំចេញ Excel
            </Button>
          </div>

          {!loading && rows.length === 0 && (
            <p className="mt-4 text-sm font-bold text-text-muted">មិនទាន់មានសិស្សក្នុងបញ្ជីនៅឡើយទេ</p>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- Print */}
      <div className="print-container bg-white text-black">
        <div className="mb-3 text-center">
          <p className="kh-moul text-[12pt]">ព្រះរាជាណាចក្រកម្ពុជា</p>
          <p className="kh-moul text-[12pt]">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
        </div>

        <div className="mb-3 flex items-start justify-between text-[10pt]">
          <div className="kh-moul leading-relaxed">
            <p>{settings?.management_unit_1 || 'មន្ទីរអប់រំ យុវជន និងកីឡា...'}</p>
            <p>{settings?.management_unit_2 || 'ការិយាល័យអប់រំ យុវជន និងកីឡា...'}</p>
            <p>{settings?.school_name || 'សាលាបឋមសិក្សា...'}</p>
          </div>
          <div className="text-right">
            <p>សិស្សសរុប៖ {toKhmerNumber(stats.total)} នាក់ ស្រី៖ {toKhmerNumber(stats.female)} នាក់</p>
            <p>មធ្យមភាគថ្នាក់៖ {stats.classAvg === null ? '-' : toKhmerNumber(stats.classAvg.toFixed(2))}</p>
          </div>
        </div>

        <h2 className="kh-moul text-center text-[13pt]">តារាងពិន្ទុ{periodLabel}</h2>
        <p className="mb-3 text-center text-[10pt] font-bold">
          ថ្នាក់ទី {settings?.class_name || '.......'} ឆ្នាំសិក្សា {academicYear}
        </p>

        <table className="moeys-table">
          <thead>
            <tr>
              <th style={{ width: '5%' }}>ល.រ</th>
              <th style={{ width: '28%' }}>គោត្តនាម និងនាម</th>
              <th style={{ width: '8%' }}>ភេទ</th>
              <th style={{ width: '11%' }}>ពិន្ទុសរុប</th>
              <th style={{ width: '11%' }}>មធ្យមភាគ</th>
              <th style={{ width: '9%' }}>និទ្ទេស</th>
              <th style={{ width: '11%' }}>ចំណាត់ថ្នាក់</th>
              <th style={{ width: '17%' }}>អាកប្បកិរិយា</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.student.id}>
                <td>{toKhmerNumber(i + 1)}</td>
                <td className="text-left">{r.student.name_kh}</td>
                <td>{r.student.gender || '-'}</td>
                <td>{r.scored > 0 ? toKhmerNumber(r.total) : '-'}</td>
                <td className={r.average !== null && r.average < scheme.passMark ? 'font-bold' : ''}>
                  {r.average === null ? '-' : toKhmerNumber(r.average.toFixed(2))}
                </td>
                <td>{r.letter}</td>
                <td>{r.rank ? toKhmerNumber(r.rank) : '-'}</td>
                <td>{r.behaviour}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 text-[9.5pt]">
          <p>សិស្សក្រោមមធ្យមភាគ៖ {toKhmerNumber(stats.below)} នាក់ · សិស្សមាននិទ្ទេស F៖ {toKhmerNumber(stats.failing)} នាក់</p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-8 text-center text-[10pt]">
          <div className="kh-moul leading-relaxed">
            <p className="mb-1">ថ្ងៃទី......ខែ......ឆ្នាំ......</p>
            <p>គ្រូប្រចាំថ្នាក់</p>
            <div className="h-16" />
            <p>{settings?.homeroom_teacher || ''}</p>
          </div>
          <div className="kh-moul leading-relaxed">
            <p className="mb-1">បានឃើញ និងឯកភាព</p>
            <p>{settings?.manager_role || 'នាយកសាលា'}</p>
            <div className="h-16" />
            <p>{settings?.manager_name || ''}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
