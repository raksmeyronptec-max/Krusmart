'use client'

import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { studentTotals, type HomeworkScores } from './scores'
import type { HomeworkDay } from './period'
import type { Settings, Student } from '@/lib/types'

/**
 * The A4 sheet a teacher files — the ministry's 26th-to-25th homework form.
 *
 * Screen-only from the caller's point of view: it renders `hidden print:block`
 * and always shows the *full month*, whichever mode is on screen. A one-day
 * sheet is not a report anyone files.
 *
 * Extracted from the entry client unchanged. The screen grid is deliberately
 * not reused here — it scrolls sideways and carries sticky columns, which print
 * as overlapping ink.
 */

export interface HomeworkPrintSheetProps {
  students: Pick<Student, 'id' | 'name_kh' | 'gender'>[]
  days: HomeworkDay[]
  scores: HomeworkScores
  settings: Settings | null
  academicYear: string
  monthLabel: string
}

export function HomeworkPrintSheet({
  students,
  days,
  scores,
  settings,
  academicYear,
  monthLabel,
}: HomeworkPrintSheetProps) {
  const femaleTotal = students.filter((s) => s.gender === 'ស្រី' || s.gender === 'F').length

  return (
    <div className="hidden print:block">
      <div className="mb-4 flex items-start justify-between">
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

      <h2 className="kh-moul mb-1 text-center text-[13pt] uppercase">
        របាយការណ៍ពិន្ទុកិច្ចការផ្ទះប្រចាំខែ{monthLabel}
      </h2>
      <p className="mb-3 text-center text-[10pt]">
        កាលបរិច្ឆេទ ២៦ ដល់ ២៥ · ឆ្នាំសិក្សា {academicYear}
      </p>

      <div className="mb-2 flex justify-between text-[10pt] font-bold">
        <p>
          សិស្សសរុប {toKhmerNumber(students.length)} នាក់ · ស្រី {toKhmerNumber(femaleTotal)} នាក់
        </p>
        <p>ថ្នាក់ទី៖ {settings?.class_name || '..........'}</p>
      </div>

      <table className="hw-print-table">
        <thead>
          <tr>
            <th rowSpan={2} className="w-7">ល.រ</th>
            <th rowSpan={2} className="min-w-[130px] text-left">គោត្តនាម និងនាម</th>
            <th rowSpan={2} className="w-9">ភេទ</th>
            <th colSpan={days.length}>កាលបរិច្ឆេទ (២៦ ដល់ ២៥)</th>
            <th rowSpan={2} className="w-12">សរុប</th>
            <th rowSpan={2} className="w-14">មធ្យមភាគ</th>
          </tr>
          <tr>
            {days.map((day) => (
              <th key={day.dayNum} className={day.isSunday ? 'sun' : ''}>
                {day.dayNum}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((stu, i) => {
            const { total, average } = studentTotals(scores[stu.id])
            return (
              <tr key={stu.id}>
                <td>{toKhmerNumber(i + 1)}</td>
                <td className="text-left font-bold">{stu.name_kh}</td>
                <td>{stu.gender}</td>
                {days.map((day) => (
                  <td key={day.dayNum} className={day.isSunday ? 'sun' : ''}>
                    {scores[stu.id]?.[day.dayNum] ?? ''}
                  </td>
                ))}
                <td className="font-bold">{total}</td>
                <td className="font-bold">{average}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="mt-8 flex justify-between text-[10pt]">
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
  )
}

export default HomeworkPrintSheet
