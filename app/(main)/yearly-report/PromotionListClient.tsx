'use client'

import { useMemo } from 'react'
import * as XLSX from 'xlsx-js-style'
import ReportFrame from './ReportFrame'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { formatKhmerDate } from '@/lib/utils/date'
import { annualGrade, buildAnnualRows, PROMOTION_THRESHOLD } from '@/lib/reports/annual'
import type { Score, Settings, Student } from '@/lib/types'

/**
 * The promoted and repeated lists.
 *
 * One component for both: the legacy build shipped `promoted-students.html` and
 * `repeated-students.html` as two ~1000-line files identical apart from a
 * comparison operator and a heading. They are the two halves of one partition,
 * so keeping them together is what stops the halves disagreeing — a pupil must
 * appear on exactly one list, and with `mode` deciding the predicate that is
 * true by construction.
 */
export function PromotionListClient({
  mode,
  students,
  annualScores,
  settings,
  academicYear,
}: {
  mode: 'promoted' | 'repeated'
  students: Student[]
  annualScores: Score[]
  settings: Settings | null
  academicYear: string
}) {
  const rows = useMemo(() => {
    const all = buildAnnualRows(students, annualScores)

    // A pupil with no annual marks at all belongs on neither list. Treating a
    // missing average as a fail would put the whole class on the repeaters sheet
    // in the weeks before the second semester is entered.
    const scored = all.filter((r) => r.average !== null)

    return scored
      .filter((r) => (mode === 'promoted' ? r.promoted : !r.promoted))
      .sort((a, b) => (b.average as number) - (a.average as number))
  }, [students, annualScores, mode])

  const femaleCount = rows.filter((r) => r.student.gender === 'ស្រី' || r.student.gender === 'F').length

  const title = mode === 'promoted' ? 'បញ្ជីរាយនាមសិស្សឡើងថ្នាក់' : 'បញ្ជីរាយនាមសិស្សត្រួតថ្នាក់'
  const subtitle =
    mode === 'promoted'
      ? `សិស្សដែលទទួលបានមធ្យមភាគប្រចាំឆ្នាំចាប់ពី ${PROMOTION_THRESHOLD.toFixed(2)} ឡើងទៅ`
      : `សិស្សដែលទទួលបានមធ្យមភាគប្រចាំឆ្នាំក្រោម ${PROMOTION_THRESHOLD.toFixed(2)}`

  const exportExcel = () => {
    const header = ['ល.រ', 'អត្តលេខ', 'គោត្តនាម និងនាម', 'ភេទ', 'ថ្ងៃខែឆ្នាំកំណើត', 'ទីកន្លែងកំណើត', 'ឪពុក/ម្តាយ', 'មធ្យមភាគប្រចាំឆ្នាំ', 'ចំណាត់ថ្នាក់', 'និទ្ទេស']

    const body = rows.map((r, i) => [
      i + 1,
      r.student.student_id || r.student.student_code || '',
      r.student.name_kh || r.student.full_name || '',
      r.student.gender || '',
      r.student.dob || '',
      birthPlace(r.student),
      parents(r.student),
      r.average!.toFixed(2),
      r.rank ?? '',
      annualGrade(r.average),
    ])

    const ws = XLSX.utils.aoa_to_sheet([[title], [`ឆ្នាំសិក្សា ${academicYear}`], [], header, ...body])
    ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 24 }, { wch: 6 }, { wch: 14 }, { wch: 26 }, { wch: 26 }, { wch: 12 }, { wch: 10 }, { wch: 8 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, mode === 'promoted' ? 'ឡើងថ្នាក់' : 'ត្រួតថ្នាក់')
    XLSX.writeFile(wb, `${title}_${academicYear}.xlsx`)
  }

  return (
    <ReportFrame
      settings={settings}
      academicYear={academicYear}
      title={title}
      subtitle={subtitle}
      onExport={rows.length > 0 ? exportExcel : undefined}
      summary={
        <p>
          ចំនួនសរុប {toKhmerNumber(rows.length)} នាក់ · ស្រី {toKhmerNumber(femaleCount)} នាក់
        </p>
      }
    >
      {rows.length === 0 ? (
        <div className="py-10">
          <EmptyState
            title="មិនទាន់មានទិន្នន័យ"
            description="សូមបញ្ចូលពិន្ទុមធ្យមភាគឆមាសទី១ និងទី២ នៅក្នុងតារាងពិន្ទុសរុបជាមុនសិន។"
          />
        </div>
      ) : (
        <table className="report-table">
          <thead>
            <tr>
              <th className="w-12">ល.រ</th>
              <th className="w-20">អត្តលេខ</th>
              <th className="text-left">គោត្តនាម នាម</th>
              <th className="w-14">ភេទ</th>
              <th className="w-28">ថ្ងៃខែឆ្នាំកំណើត</th>
              <th className="text-left">ទីកន្លែងកំណើត</th>
              <th className="text-left">ឪពុក/ម្តាយ</th>
              <th className="w-24">មធ្យមភាគប្រចាំឆ្នាំ</th>
              <th className="w-20">ចំណាត់ថ្នាក់</th>
              <th className="w-16">និទ្ទេស</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.student.id}>
                <td className="text-center">{toKhmerNumber(i + 1)}</td>
                <td className="text-center">{r.student.student_id || r.student.student_code || '-'}</td>
                <td className="font-bold">{r.student.name_kh || r.student.full_name}</td>
                <td className="text-center">{r.student.gender || '-'}</td>
                <td className="text-center">{r.student.dob ? formatKhmerDate(r.student.dob) : '-'}</td>
                <td>{birthPlace(r.student)}</td>
                <td>{parents(r.student)}</td>
                <td className="text-center font-bold">{r.average!.toFixed(2)}</td>
                <td className="text-center">{r.rank !== null ? toKhmerNumber(r.rank) : '-'}</td>
                <td className="text-center font-bold">{annualGrade(r.average)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReportFrame>
  )
}

/** Village → commune → district → province, skipping the parts left blank. */
function birthPlace(s: Student): string {
  const parts = [s.birth_village, s.birth_commune, s.birth_district, s.birth_province].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : '-'
}

/** Both parents on one line, which is how the ministry sheet prints them. */
function parents(s: Student): string {
  const names = [s.father_name, s.mother_name].filter(Boolean)
  return names.length > 0 ? names.join(' / ') : '-'
}

export default PromotionListClient
