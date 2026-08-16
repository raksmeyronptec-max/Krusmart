import * as XLSX from 'xlsx-js-style'
import type { Student } from '@/lib/types'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { calculateAge } from '@/lib/utils/date'

const formatLocation = (v?: string | null, c?: string | null, d?: string | null, p?: string | null) => {
  const parts = [v, c, d, p].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : '-'
}

const formatParent = (name?: string | null, job?: string | null) => {
  if (!name && !job) return '-'
  let res = name ? name.trim() : 'មិនស្គាល់'
  if (job && job.trim()) res += ` (${job.trim()})`
  return res
}

const formatDateDisplay = (dobStr: string) => {
  if (!dobStr) return '-'
  const parts = dobStr.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return dobStr
}

export const exportStudentsToExcel = (students: Student[], className?: string) => {
  // Define columns
  const headers = [
    'ល.រ', 'អត្តលេខ', 'គោត្តនាម និងនាម', 'ឈ្មោះឡាតាំង', 'ភេទ', 'ថ្ងៃខែឆ្នាំកំណើត', 'អាយុ',
    'ថ្នាក់', 'ស្ថានភាព', 'វត្តមាន', 'មធ្យមភាគ',
    'លេខទូរសព្ទ', 'អាសយដ្ឋានបច្ចុប្បន្ន', 'ទីកន្លែងកំណើត',
    'ឪពុក', 'ម្តាយ', 'អាណាព្យាបាល',
    'ផ្សេងៗ'
  ]

  // Map data to rows
  const data = students.map((s, index) => {
    const age = calculateAge(s.dob)
    const statusArr = []
    if (s.is_new_student) statusArr.push('សិស្សថ្មី')
    if (s.is_repeater) statusArr.push('សិស្សត្រួតថ្នាក់')
    if (s.is_disabled) statusArr.push('ពិការ')
    if (s.is_equity) statusArr.push('សមធម៌')
    if (s.is_scholarship) statusArr.push('អាហារូបករណ៍')
    if (s.poor_status && s.poor_status !== 'គ្មាន') statusArr.push(s.poor_status)
    if (s.orphan_status && s.orphan_status !== 'ទេ') statusArr.push(s.orphan_status)
    const status = statusArr.join(', ') || '-'

    return [
      toKhmerNumber(index + 1),
      s.student_id || '-',
      s.name_kh || '-',
      s.name_en || '-',
      s.gender || '-',
      formatDateDisplay(s.dob),
      age !== null ? toKhmerNumber(age) : '-',
      s.grade || className || '-',
      status,
      s.attendance_rate !== null && s.attendance_rate !== undefined ? `${toKhmerNumber(s.attendance_rate)}%` : '-',
      s.overall_average !== null && s.overall_average !== undefined ? toKhmerNumber(s.overall_average) : '-',
      s.phone || '-',
      formatLocation(s.curr_village, s.curr_commune, s.curr_district, s.curr_province),
      formatLocation(s.birth_village, s.birth_commune, s.birth_district, s.birth_province),
      formatParent(s.father_name, s.father_job),
      formatParent(s.mother_name, s.mother_job),
      formatParent(s.guardian_name, s.guardian_job),
      [s.special_features, s.other_remarks].filter(Boolean).join(' | ') || '-'
    ]
  })

  // Add header to data
  const worksheetData = [headers, ...data]

  const ws = XLSX.utils.aoa_to_sheet(worksheetData)

  // Style header row
  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "1D4ED8" } }, // Tailwind blue-700
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { auto: 1 } },
      right: { style: "thin", color: { auto: 1 } },
      bottom: { style: "thin", color: { auto: 1 } },
      left: { style: "thin", color: { auto: 1 } }
    }
  }

  const dataStyle = {
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "thin", color: { auto: 1 } },
      right: { style: "thin", color: { auto: 1 } },
      bottom: { style: "thin", color: { auto: 1 } },
      left: { style: "thin", color: { auto: 1 } }
    }
  }

  for (let i = 0; i < headers.length; i++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: i })
    if (ws[cellRef]) ws[cellRef].s = headerStyle
  }

  // Apply basic borders to all data cells
  for (let r = 1; r <= data.length; r++) {
    for (let c = 0; c < headers.length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c })
      if (ws[cellRef]) ws[cellRef].s = dataStyle
    }
  }

  // Set column widths
  ws['!cols'] = [
    { wch: 6 },  // ល.រ
    { wch: 15 }, // អត្តលេខ
    { wch: 25 }, // គោត្តនាម និងនាម
    { wch: 20 }, // ឈ្មោះឡាតាំង
    { wch: 10 }, // ភេទ
    { wch: 15 }, // ថ្ងៃខែឆ្នាំកំណើត
    { wch: 10 }, // អាយុ
    { wch: 15 }, // ថ្នាក់
    { wch: 25 }, // ស្ថានភាព
    { wch: 15 }, // វត្តមាន
    { wch: 15 }, // មធ្យមភាគ
    { wch: 20 }, // លេខទូរសព្ទ
    { wch: 35 }, // អាសយដ្ឋានបច្ចុប្បន្ន
    { wch: 35 }, // ទីកន្លែងកំណើត
    { wch: 25 }, // ឪពុក
    { wch: 25 }, // ម្តាយ
    { wch: 25 }, // អាណាព្យាបាល
    { wch: 30 }  // ផ្សេងៗ
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "បញ្ជីសិស្ស")

  const filename = className ? `បញ្ជីសិស្ស_ថ្នាក់_${className}.xlsx` : `បញ្ជីសិស្ស.xlsx`
  XLSX.writeFile(wb, filename)
}
