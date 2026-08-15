'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BookUser, Printer, Users } from 'lucide-react'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { gradeFor } from '@/lib/grading/scheme'
import { scoreCellValue } from '@/lib/utils/score-value'
import type { AttendanceRecord, Score, Settings, Student } from '@/lib/types'

/**
 * សៀវភៅសិក្ខាគារិក — one A4 landscape sheet per student.
 *
 * Four sections, matching the MoEYS form:
 *   ក. semester and annual results per subject
 *   ខ. absences, split excused / unexcused per semester
 *   គ. the four behavioural assessments
 *   ឃ. the annual outcome, with space for the two signatures
 *
 * Everything is derived from `scores` and `attendance` — nothing here is stored,
 * so the booklet always reflects what the gradebook currently holds.
 */

/** The 13 semester subjects, in the order the printed form lists them. */
const SUBJECTS: { key: string; label: string }[] = [
  { key: 'sem_kh_reading', label: 'អំណាន' },
  { key: 'sem_kh_listening_speaking', label: 'ស្តាប់-និយាយ' },
  { key: 'sem_kh_dictation', label: 'សរសេរតាមអាន' },
  { key: 'sem_kh_essay', label: 'តែងសេចក្តី' },
  { key: 'sem_math', label: 'គណិតវិទ្យា' },
  { key: 'sem_science', label: 'វិទ្យាសាស្ត្រ' },
  { key: 'sem_moral_civics', label: 'សីលធម៌-ពលរដ្ឋ' },
  { key: 'sem_geo', label: 'ភូមិវិទ្យា' },
  { key: 'sem_hist', label: 'ប្រវត្តិវិទ្យា' },
  { key: 'sem_home_arts', label: 'គេហវិទ្យា' },
  { key: 'sem_life_skills', label: 'បំណិនជីវិត' },
  { key: 'sem_foreign', label: 'ភាសាបរទេស' },
  { key: 'sem_sport', label: 'កីឡា' },
]

/** Section គ — the behavioural columns, which hold words rather than marks. */
const BEHAVIOUR: { key: string; label: string }[] = [
  { key: 'sem_eval_knowledge', label: 'ចំណេះដឹង' },
  { key: 'sem_eval_skill', label: 'បំណិន-ចំណេះធ្វើ' },
  { key: 'sem_eval_moral', label: 'តម្លៃ-សីលធម៌' },
  { key: 'sem_eval_participate', label: 'សាមគ្គីភាព' },
]

const DASH = '-'

function fmt(v: number | string | null): string {
  if (v === null || v === undefined || v === '') return DASH
  return typeof v === 'number' ? toKhmerNumber(v) : String(v)
}

export default function RecordBookClient({
  students,
  scores,
  attendance,
  settings,
  academicYear,
}: {
  students: Student[]
  scores: Score[]
  attendance: AttendanceRecord[]
  settings: Settings | null
  academicYear: string
}) {
  const [selectedId, setSelectedId] = useState<string>('')

  /**
   * `student → subject → { sem1, sem2, annual }`, plus the absence tally.
   *
   * Built once for the whole roster rather than per sheet: printing the class
   * renders every student at once, and re-scanning the score list inside each
   * sheet would be quadratic.
   */
  const byStudent = useMemo(() => {
    const map = new Map<
      string,
      {
        marks: Record<string, { sem1: number | string | null; sem2: number | string | null; annual: number | string | null }>
        absent: { s1: { ap: number; a: number }; s2: { ap: number; a: number } }
      }
    >()

    for (const s of students) {
      map.set(s.id, {
        marks: {},
        absent: { s1: { ap: 0, a: 0 }, s2: { ap: 0, a: 0 } },
      })
    }

    for (const row of scores) {
      const entry = map.get(row.student_id)
      if (!entry) continue

      const value = scoreCellValue(row)
      const slot = (entry.marks[row.subject] ??= { sem1: null, sem2: null, annual: null })

      if (row.score_type === 'annual') slot.annual = value
      else if (row.score_period.startsWith('sem1')) slot.sem1 = value
      else if (row.score_period.startsWith('sem2')) slot.sem2 = value
    }

    // The school year runs November → October, so months 11–12 and 1–3 fall in
    // the first semester and the rest in the second.
    for (const row of attendance) {
      const entry = map.get(row.student_id)
      if (!entry) continue
      if (row.status !== 'A' && row.status !== 'AP') continue

      const month = Number(row.date.slice(5, 7))
      const half = month >= 11 || month <= 3 ? entry.absent.s1 : entry.absent.s2
      if (row.status === 'AP') half.ap += 1
      else half.a += 1
    }

    return map
  }, [students, scores, attendance])

  const sheets = selectedId ? students.filter((s) => s.id === selectedId) : students

  return (
    <div className="min-h-screen font-battambang print:bg-white">
      <style jsx global>{`
        .print-container { display: none; }
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body { background: #fff !important; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-container { display: block !important; }
          .record-sheet {
            width: 29.7cm;
            height: 21cm;
            padding: 1.2cm 1.5cm;
            margin: 0;
            box-sizing: border-box;
            box-shadow: none !important;
            break-after: page;
          }
          .record-sheet:last-child { break-after: auto; }
        }
        .rb-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
        .rb-table th, .rb-table td { border: 1px solid #000; padding: 2px 4px; text-align: center; }
        .rb-table th { font-family: 'Moul', cursive; font-weight: normal; font-size: 8pt; }
      `}</style>

      {/* ---------------------------------------------------------------- UI */}
      <div className="no-print mx-auto max-w-5xl px-4 py-6 md:py-8">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/60 px-4 py-2 font-bold text-brand shadow-sm backdrop-blur-sm transition hover:text-brand-800"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" /> ត្រឡប់ទៅទំព័រដើម
        </Link>

        <div className="rounded-xl border border-divider bg-bg-surface p-6 shadow-lg md:p-8">
          <div className="mb-6 flex items-center gap-3 border-b border-divider pb-4">
            <div className="rounded-full bg-success/10 p-3 text-success dark:bg-success/10 dark:text-success">
              <BookUser className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="kh-moul text-xl text-brand md:text-2xl dark:text-brand-300">សៀវភៅសិក្ខាគារិក</h1>
              <p className="mt-1 text-sm text-text-muted">
                ទំហំ A4 ផ្តេក — មួយសន្លឹកក្នុងមួយសិស្ស · ឆ្នាំសិក្សា {academicYear}
              </p>
            </div>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label htmlFor="rb-student" className="mb-1.5 block text-sm font-bold text-text-body">
                ជ្រើសរើសសិស្ស
              </label>
              <SearchableSelect
                id="rb-student"
                ariaLabel="ជ្រើសរើសសិស្ស"
                placeholder="-- សិស្សទាំងអស់ --"
                searchPlaceholder="ស្វែងរកសិស្ស..."
                emptyMessage="រកមិនឃើញសិស្ស"
                value={selectedId}
                onChange={setSelectedId}
                options={[
                  { value: '', label: `-- សិស្សទាំងអស់ (${toKhmerNumber(students.length)} នាក់) --` },
                  ...students.map((s) => ({ value: s.id, label: s.name_kh })),
                ]}
              />
            </div>
            <button
              onClick={() => window.print()}
              disabled={students.length === 0}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-danger px-6 py-2.5 font-bold text-white shadow-md transition hover:opacity-90 disabled:opacity-50"
            >
              <Printer className="h-4 w-4" aria-hidden="true" /> បោះពុម្ព
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-brand-100 px-4 py-3 text-sm text-brand-800 dark:bg-brand-900/50 dark:text-brand-300">
            <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
            {students.length === 0
              ? 'មិនទាន់មានសិស្សក្នុងបញ្ជីនៅឡើយទេ'
              : `នឹងបោះពុម្ព ${toKhmerNumber(sheets.length)} សន្លឹក`}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- Print */}
      <div className="print-container">
        {sheets.map((student) => {
          const entry = byStudent.get(student.id)
          const annualAvg = entry?.marks['annual_avg']?.annual ?? null
          const result = typeof annualAvg === 'number' ? gradeFor(annualAvg) : null

          return (
            <section key={student.id} className="record-sheet bg-white text-black">
              <div className="mb-2 text-center">
                <p className="kh-moul text-[11pt]">ព្រះរាជាណាចក្រកម្ពុជា</p>
                <p className="kh-moul text-[11pt]">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
                <h2 className="kh-moul mt-2 text-[15pt]">សៀវភៅសិក្ខាគារិក</h2>
              </div>

              {/* Identity */}
              <div className="mb-3 grid grid-cols-3 gap-x-6 gap-y-1 text-[9.5pt]">
                <p><b>ឈ្មោះសិស្ស៖</b> {student.name_kh}</p>
                <p><b>ភេទ៖</b> {student.gender || DASH}</p>
                <p><b>អត្តលេខ៖</b> {student.student_id || DASH}</p>
                <p><b>គ្រឹះស្ថានសិក្សា៖</b> {settings?.school_name || DASH}</p>
                <p><b>ថ្នាក់៖</b> {student.grade || settings?.class_name || DASH}</p>
                <p><b>ឆ្នាំសិក្សា៖</b> {academicYear}</p>
              </div>

              <div className="grid grid-cols-[1.55fr_1fr] gap-4">
                {/* ក. Results */}
                <div>
                  <p className="kh-moul mb-1 text-[9.5pt]">ក. លទ្ធផលនៃការប្រឡងឆមាស</p>
                  <table className="rb-table">
                    <thead>
                      <tr>
                        <th rowSpan={2} style={{ width: '34%' }}>មុខវិជ្ជា</th>
                        <th>ឆមាសទី១</th>
                        <th>ឆមាសទី២</th>
                        <th>ប្រចាំឆ្នាំ</th>
                      </tr>
                      <tr>
                        <th>ពិន្ទុ</th>
                        <th>ពិន្ទុ</th>
                        <th>ពិន្ទុ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SUBJECTS.map((sub) => {
                        const m = entry?.marks[sub.key]
                        return (
                          <tr key={sub.key}>
                            <td className="text-left">{sub.label}</td>
                            <td>{fmt(m?.sem1 ?? null)}</td>
                            <td>{fmt(m?.sem2 ?? null)}</td>
                            <td>{fmt(m?.annual ?? null)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-3">
                  {/* ខ. Absences */}
                  <div>
                    <p className="kh-moul mb-1 text-[9.5pt]">ខ. ចំនួនពេលអវត្តមាន</p>
                    <table className="rb-table">
                      <thead>
                        <tr>
                          <th rowSpan={2} style={{ width: '28%' }}>ឆមាស</th>
                          <th>មានច្បាប់</th>
                          <th>គ្មានច្បាប់</th>
                          <th rowSpan={2}>សរុប</th>
                        </tr>
                        <tr>
                          <th>ដង</th>
                          <th>ដង</th>
                        </tr>
                      </thead>
                      <tbody>
                        {([['ទី១', 's1'], ['ទី២', 's2']] as const).map(([label, key]) => {
                          const a = entry?.absent[key] ?? { ap: 0, a: 0 }
                          return (
                            <tr key={key}>
                              <td>{label}</td>
                              <td>{toKhmerNumber(a.ap)}</td>
                              <td>{toKhmerNumber(a.a)}</td>
                              <td>{toKhmerNumber(a.ap + a.a)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* គ. Behaviour */}
                  <div>
                    <p className="kh-moul mb-1 text-[9.5pt]">គ. ការវាយតម្លៃសីលធម៌ និងអាកប្បកិរិយា</p>
                    <table className="rb-table">
                      <thead>
                        <tr>
                          <th style={{ width: '44%' }}>ផ្នែក</th>
                          <th>ឆមាសទី១</th>
                          <th>ឆមាសទី២</th>
                        </tr>
                      </thead>
                      <tbody>
                        {BEHAVIOUR.map((b) => {
                          const m = entry?.marks[b.key]
                          return (
                            <tr key={b.key}>
                              <td className="text-left">{b.label}</td>
                              <td>{fmt(m?.sem1 ?? null)}</td>
                              <td>{fmt(m?.sem2 ?? null)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* ឃ. Annual outcome */}
                  <div>
                    <p className="kh-moul mb-1 text-[9.5pt]">ឃ. លទ្ធផលនៃការសិក្សាប្រចាំឆ្នាំ</p>
                    <table className="rb-table">
                      <tbody>
                        <tr>
                          <td className="text-left" style={{ width: '44%' }}>មធ្យមភាគប្រចាំឆ្នាំ</td>
                          <td>{fmt(annualAvg)}</td>
                          <td>{result?.letter ?? DASH}</td>
                        </tr>
                        <tr>
                          <td className="text-left">និទ្ទេស</td>
                          <td colSpan={2}>{result?.label ?? DASH}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Signatures */}
              <div className="mt-3 grid grid-cols-2 gap-8 text-center text-[9pt]">
                <div className="kh-moul">
                  <p>មូលវិចាររបស់គ្រូបន្ទុកថ្នាក់</p>
                  <div className="h-12" />
                  <p>{settings?.homeroom_teacher || ''}</p>
                </div>
                <div className="kh-moul">
                  <p>មូលវិចាររបស់{settings?.manager_role || 'នាយកសាលា'}</p>
                  <div className="h-12" />
                  <p>{settings?.manager_name || ''}</p>
                </div>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
