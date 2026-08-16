'use client'

import { Fragment, useMemo } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx-js-style'
import { ArrowLeft, Printer, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { MONTHS_BY_ACADEMIC_YEAR } from '@/lib/constants/months'
import { resolveCalendarYear } from '@/lib/constants/academic'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { AttendanceRecord, Settings, Student } from '@/lib/types'

/**
 * Yearly absence totals — `attendance/yearly-report.html` restored.
 *
 * Excused (`L`, ច្បាប់) and unexcused (`A`, អច្បាប់) are counted separately for
 * every month, then rolled up per semester and for the year. `AP` is folded in
 * with `A`, matching how `/score-analyse` treats it.
 *
 * SEMESTER SPLIT
 * The legacy file ran October → September and split Oct-Mar / Apr-Sep. This app
 * defines the school year as November → October (`MONTHS_BY_ACADEMIC_YEAR`, see
 * CLAUDE.md), so the split here is the first six academic months against the
 * last six — Nov-Apr and May-Oct. Following the legacy boundary instead would
 * put this one report a month out of step with every other view in the app.
 */

const MONTH_COUNT = MONTHS_BY_ACADEMIC_YEAR.length
/** Ids of the first-semester months; everything else rolls into semester two. */
const SEM1_IDS = new Set(MONTHS_BY_ACADEMIC_YEAR.slice(0, MONTH_COUNT / 2).map((m) => m.id))

interface Counts {
  L: number
  A: number
}

interface Row {
  student: Student
  /** Month id → excused/unexcused counts. */
  months: Record<string, Counts>
  sem1: Counts
  sem2: Counts
  year: Counts
}

const zero = (): Counts => ({ L: 0, A: 0 })

/** Blank rather than a zero: a sheet of noughts is unreadable on paper. */
function disp(n: number): string {
  return n > 0 ? toKhmerNumber(n) : ''
}

export function YearlyAbsenceClient({
  students,
  attendance,
  settings,
  academicYear,
}: {
  students: Student[]
  attendance: AttendanceRecord[]
  settings: Settings | null
  academicYear: string
}) {
  const rows = useMemo<Row[]>(() => {
    // `YYYY-MM` → month id, so each record is bucketed by string comparison
    // rather than by constructing a Date per row.
    const monthByPrefix = new Map<string, string>()
    for (const m of MONTHS_BY_ACADEMIC_YEAR) {
      monthByPrefix.set(`${resolveCalendarYear(academicYear, m.isNextYear)}-${m.num}`, m.id)
    }

    const byStudent = new Map<string, Row>()
    for (const student of students) {
      byStudent.set(student.id, {
        student,
        months: Object.fromEntries(MONTHS_BY_ACADEMIC_YEAR.map((m) => [m.id, zero()])),
        sem1: zero(),
        sem2: zero(),
        year: zero(),
      })
    }

    for (const rec of attendance) {
      const row = byStudent.get(rec.student_id)
      if (!row) continue

      const monthId = monthByPrefix.get(String(rec.date).slice(0, 7))
      if (!monthId) continue

      // Only absences are tallied; a present mark contributes nothing.
      const kind: keyof Counts | null =
        rec.status === 'L' ? 'L' : rec.status === 'A' || rec.status === 'AP' ? 'A' : null
      if (!kind) continue

      row.months[monthId][kind]++
    }

    for (const row of byStudent.values()) {
      for (const m of MONTHS_BY_ACADEMIC_YEAR) {
        const c = row.months[m.id]
        const target = SEM1_IDS.has(m.id) ? row.sem1 : row.sem2
        target.L += c.L
        target.A += c.A
      }
      row.year.L = row.sem1.L + row.sem2.L
      row.year.A = row.sem1.A + row.sem2.A
    }

    return [...byStudent.values()]
  }, [students, attendance, academicYear])

  const totals = useMemo(
    () => rows.reduce(
      (acc, r) => ({ L: acc.L + r.year.L, A: acc.A + r.year.A }),
      zero(),
    ),
    [rows],
  )

  const exportExcel = () => {
    const head1: (string | number)[] = ['ល.រ', 'គោត្តនាម និងនាម']
    const head2: (string | number)[] = ['', '']

    for (const m of MONTHS_BY_ACADEMIC_YEAR) {
      head1.push(m.label, '')
      head2.push('ច្ប', 'អច្ប')
    }
    for (const label of ['ឆមាសទី១', 'ឆមាសទី២', 'ប្រចាំឆ្នាំ']) {
      head1.push(label, '', '')
      head2.push('ច្ប', 'អច្ប', 'សរុប')
    }

    const body = rows.map((r, i) => {
      const line: (string | number)[] = [i + 1, r.student.name_kh || r.student.full_name || '']
      for (const m of MONTHS_BY_ACADEMIC_YEAR) {
        line.push(r.months[m.id].L || '', r.months[m.id].A || '')
      }
      for (const s of [r.sem1, r.sem2, r.year]) {
        line.push(s.L || '', s.A || '', s.L + s.A || '')
      }
      return line
    })

    const ws = XLSX.utils.aoa_to_sheet([
      ['ចំនួនសរុបអវត្តមានសិស្សប្រចាំឆ្នាំ'],
      [`ឆ្នាំសិក្សា ${academicYear} · ថ្នាក់ ${settings?.class_name || ''}`],
      [],
      head1,
      head2,
      ...body,
    ])
    ws['!cols'] = [{ wch: 5 }, { wch: 24 }, ...Array(MONTH_COUNT * 2 + 9).fill({ wch: 5 })]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'អវត្តមានប្រចាំឆ្នាំ')
    XLSX.writeFile(wb, `អវត្តមានប្រចាំឆ្នាំ_${academicYear}.xlsx`)
  }

  return (
    <div className="min-h-screen bg-paper text-text-heading pb-10 print:bg-white">
      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-sheet { box-shadow: none !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
        }
        .abs-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
        .abs-table th, .abs-table td { border: 1px solid #444; padding: 2px 3px; text-align: center; }
        .abs-table th { background-color: #f1f5f9; font-weight: 700; }
        .abs-table td.name { text-align: left; white-space: nowrap; font-weight: 700; }
      `}</style>

      <div className="no-print mx-auto mt-8 max-w-[1400px] px-4">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/attendance/monthly"
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-bg-surface/50 px-4 py-2 font-bold text-brand shadow-sm backdrop-blur-sm transition hover:text-brand-800"
          >
            <ArrowLeft className="h-5 w-5" /> ត្រឡប់ទៅបញ្ជីវត្តមានប្រចាំខែ
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" printHidden={false} onClick={exportExcel} icon={<FileSpreadsheet className="h-4 w-4" />}>
              នាំចេញ Excel
            </Button>
            <Button printHidden={false} onClick={() => window.print()} icon={<Printer className="h-4 w-4" />}>
              បោះពុម្ព
            </Button>
          </div>
        </div>
      </div>

      <div className="print-sheet mx-auto max-w-[1400px] bg-bg-surface p-6 shadow-lg print:bg-white md:p-8">
        <div className="mb-5 flex items-start justify-between">
          <div className="kh-moul text-[10pt] leading-relaxed" style={{ marginTop: '24pt' }}>
            <p>{settings?.management_unit_1 || 'មន្ទីរអប់រំ យុវជន និងកីឡា...'}</p>
            <p>{settings?.management_unit_2 || 'ការិយាល័យអប់រំ យុវជន និងកីឡា...'}</p>
            <p>{settings?.school_name || 'សាលា...'}</p>
          </div>
          <div className="text-center">
            <h3 className="kh-moul mb-1 text-[12pt]">ព្រះរាជាណាចក្រកម្ពុជា</h3>
            <h3 className="kh-moul mb-1 text-[12pt]">ជាតិ សាសនា ព្រះមហាក្សត្រ</h3>
          </div>
        </div>

        <h2 className="kh-moul mb-1 text-center text-[14pt] uppercase">ចំនួនសរុបអវត្តមានសិស្សប្រចាំឆ្នាំ</h2>
        <p className="mb-4 text-center text-[10pt]">ច្ប = ច្បាប់ · អច្ប = អត់ច្បាប់</p>

        <div className="mb-2 flex flex-wrap items-end justify-between gap-2 text-[11pt] font-bold">
          <p>
            សិស្សសរុប {toKhmerNumber(students.length)} នាក់ · ច្បាប់ {toKhmerNumber(totals.L)} · អត់ច្បាប់ {toKhmerNumber(totals.A)}
          </p>
          <p>ថ្នាក់ទី៖ {settings?.class_name || '..........'} · ឆ្នាំសិក្សា {academicYear}</p>
        </div>

        {students.length === 0 ? (
          <div className="py-10">
            <EmptyState title="មិនទាន់មានសិស្ស" description="សូមបញ្ចូលព័ត៌មានសិស្សជាមុនសិន។" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="abs-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="w-8">ល.រ</th>
                  <th rowSpan={2} className="min-w-[150px]">គោត្តនាម និងនាម</th>
                  <th colSpan={MONTH_COUNT * 2}>អវត្តមានប្រចាំខែ</th>
                  <th colSpan={6}>អវត្តមានប្រចាំឆមាស</th>
                  <th colSpan={3}>សរុបប្រចាំឆ្នាំ</th>
                </tr>
                <tr>
                  {MONTHS_BY_ACADEMIC_YEAR.map((m) => (
                    <th key={m.id} colSpan={2} className="whitespace-nowrap px-1">{m.label}</th>
                  ))}
                  <th colSpan={3}>ឆមាសទី១</th>
                  <th colSpan={3}>ឆមាសទី២</th>
                  <th colSpan={3}>ប្រចាំឆ្នាំ</th>
                </tr>
                <tr>
                  {MONTHS_BY_ACADEMIC_YEAR.map((m) => (
                    <Fragment key={m.id}>
                      <th className="w-6 text-[8pt]">ច្ប</th>
                      <th className="w-6 text-[8pt]">អច្ប</th>
                    </Fragment>
                  ))}
                  {['sem1', 'sem2', 'year'].map((g) => (
                    <Fragment key={g}>
                      <th className="w-6 text-[8pt]">ច្ប</th>
                      <th className="w-6 text-[8pt]">អច្ប</th>
                      <th className="w-7 text-[8pt]">សរុប</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.student.id}>
                    <td>{toKhmerNumber(i + 1)}</td>
                    <td className="name">{r.student.name_kh || r.student.full_name}</td>
                    {MONTHS_BY_ACADEMIC_YEAR.map((m) => (
                      <Fragment key={m.id}>
                        <td>{disp(r.months[m.id].L)}</td>
                        <td className="text-danger">{disp(r.months[m.id].A)}</td>
                      </Fragment>
                    ))}
                    {[r.sem1, r.sem2, r.year].map((s, gi) => (
                      <Fragment key={gi}>
                        <td>{disp(s.L)}</td>
                        <td className="text-danger">{disp(s.A)}</td>
                        <td className="font-bold">{disp(s.L + s.A)}</td>
                      </Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-8 flex justify-between text-[11pt]">
          <div className="text-center">
            <p className="kh-moul uppercase">{settings?.manager_role || 'នាយកសាលា'}</p>
            <p className="mt-14">{settings?.manager_name || settings?.director_name || ''}</p>
          </div>
          <div className="text-center">
            <p className="mb-1">
              ធ្វើនៅ {settings?.province_date || settings?.province_for_date || '..............'}, ថ្ងៃទី....... ខែ........... ឆ្នាំ២០២...
            </p>
            <p className="kh-moul">គ្រូបន្ទុកថ្នាក់</p>
            <p className="mt-10">{settings?.homeroom_teacher || settings?.teacher_name || ''}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default YearlyAbsenceClient
