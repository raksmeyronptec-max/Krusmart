'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { getMonthlyAttendance, getTeacherSettings } from './actions'
import Link from 'next/link'
import * as XLSX from 'xlsx-js-style'
import html2pdf from 'html2pdf.js'
import { toKhmerLunarDate } from 'khmer-chhankitek-calendar'
import Select from '@/components/ui/forms/Select'
import type { AttendanceRecord, Settings, Student } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { KHMER_MONTH_LABELS } from '@/lib/constants/months'
import { ALIGN_CENTER, ALIGN_LEFT, ALIGN_RIGHT, emptyCell, khmerFont, moulFont, THIN_BORDER, type SheetMerge, type SheetRow, type SheetRowMeta } from '@/lib/utils/xlsx'

const days = ["អាទិត្យ", "ច័ន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"]
export default function MonthlyAttendanceClient({ initialStudents}: { initialStudents: Student[] }) {
    const today = new Date()
    const [month, setMonth] = useState(today.getMonth())
    const [year, setYear] = useState(today.getFullYear())
    const [studentCount, setStudentCount] = useState(initialStudents.length)
    const [attendance, setAttendance] = useState<Record<string, Record<string, AttendanceRecord>>>({})
    const [settings, setSettings] = useState<Settings | null>(null)
    const [isDownloading, setIsDownloading] = useState(false)

    const loadData = useCallback(async () => {
        const records = await getMonthlyAttendance(year, month)
        const newAttendance: Record<string, Record<string, AttendanceRecord>> = {}
        
        records.forEach((r: AttendanceRecord) => {
            if (!newAttendance[r.date]) newAttendance[r.date] = {}
            newAttendance[r.date][r.student_id] = r
        })
        setAttendance(newAttendance)

        const teacherSettings = await getTeacherSettings()
        if (teacherSettings) {
            setSettings(teacherSettings)
        }
    }, [month, year])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously during the effect
        loadData()
    }, [loadData])


    const exportExcel = () => {
        const daysCount = new Date(year, month + 1, 0).getDate()
        const totalCols = daysCount + 6
        const ws_data: SheetRow[] = []
        const merges: SheetMerge[] = []

        const BORDER = THIN_BORDER
        const FONT_NORMAL = khmerFont(10)
        const FONT_BOLD = khmerFont(10, true)
        const FONT_MOUL = moulFont(11)

        // Header Structure
        const r0 = Array(totalCols).fill(null).map(() => emptyCell())
        r0[0] = { v: 'ព្រះរាជាណាចក្រកម្ពុជា', t: 's', s: { font: FONT_MOUL, alignment: ALIGN_CENTER } }
        ws_data.push(r0); merges.push({s:{r:0, c:0}, e:{r:0, c:totalCols-1}})

        const r1 = Array(totalCols).fill(null).map(() => emptyCell())
        r1[0] = { v: 'ជាតិ សាសនា ព្រះមហាក្សត្រ', t: 's', s: { font: FONT_MOUL, alignment: ALIGN_CENTER } }
        ws_data.push(r1); merges.push({s:{r:1, c:0}, e:{r:1, c:totalCols-1}})

        const r2 = Array(totalCols).fill(null).map(() => emptyCell())
        r2[0] = { v: 'មន្ទីរអប់រំ យុវជន និងកីឡា..................', t: 's', s: { font: FONT_BOLD, alignment: ALIGN_LEFT } }
        ws_data.push(r2); merges.push({s:{r:2, c:0}, e:{r:2, c:8}})

        const r3 = Array(totalCols).fill(null).map(() => emptyCell())
        r3[0] = { v: 'ការិយាល័យអប់រំ យុវជន និងកីឡា..................', t: 's', s: { font: FONT_BOLD, alignment: ALIGN_LEFT } }
        ws_data.push(r3); merges.push({s:{r:3, c:0}, e:{r:3, c:8}})

        const r4 = Array(totalCols).fill(null).map(() => emptyCell())
        r4[0] = { v: 'សាលារៀន..................', t: 's', s: { font: FONT_BOLD, alignment: ALIGN_LEFT } }
        ws_data.push(r4); merges.push({s:{r:4, c:0}, e:{r:4, c:8}})

        ws_data.push(Array(totalCols).fill(null).map(() => emptyCell()))

        const r6 = Array(totalCols).fill(null).map(() => emptyCell())
        r6[0] = { v: `របាយការណ៍វត្តមានសិស្សប្រចាំខែ ${KHMER_MONTH_LABELS[month]}`, t: 's', s: { font: { ...FONT_MOUL, sz: 12 }, alignment: ALIGN_CENTER } }
        ws_data.push(r6); merges.push({s:{r:6, c:0}, e:{r:6, c:totalCols-1}})

        const r7 = Array(totalCols).fill(null).map(() => emptyCell())
        r7[0] = { v: 'ថ្នាក់ទី..................', t: 's', s: { font: FONT_BOLD, alignment: ALIGN_LEFT } }
        r7[totalCols - 3] = { v: `ឆ្នាំសិក្សា ២០២៤-២០២៥`, t: 's', s: { font: FONT_BOLD, alignment: ALIGN_RIGHT } }
        ws_data.push(r7)
        merges.push({s:{r:7, c:0}, e:{r:7, c:5}})
        merges.push({s:{r:7, c:totalCols-3}, e:{r:7, c:totalCols-1}})

        ws_data.push(Array(totalCols).fill(null).map(() => emptyCell()))

        // Table Headers
        const startRow = 9
        const TH_STYLE = { font: FONT_BOLD, alignment: ALIGN_CENTER, border: BORDER, fill: { fgColor: { rgb: "FFFCFCFC" } } }
        const TH_VERT = { ...TH_STYLE, alignment: { textRotation: 90, vertical: 'center', horizontal: 'center' } }

        const th1 = Array(totalCols).fill(null).map(() => emptyCell(TH_STYLE))
        const th2 = Array(totalCols).fill(null).map(() => emptyCell(TH_STYLE))
        const th3 = Array(totalCols).fill(null).map(() => emptyCell(TH_STYLE))

        th1[0] = { v: 'ល.រ', t: 's', s: TH_STYLE }; merges.push({s:{r:startRow, c:0}, e:{r:startRow+2, c:0}})
        th1[1] = { v: 'គោត្តនាម និងនាម', t: 's', s: TH_STYLE }; merges.push({s:{r:startRow, c:1}, e:{r:startRow+2, c:1}})
        th1[2] = { v: 'កាលបរិច្ឆេទ', t: 's', s: TH_STYLE }; merges.push({s:{r:startRow, c:2}, e:{r:startRow, c:1+daysCount}})
        
        const absCol = 2 + daysCount
        th1[absCol] = { v: 'អវត្តមាន', t: 's', s: TH_STYLE }; merges.push({s:{r:startRow, c:absCol}, e:{r:startRow+1, c:absCol+2}})
        th1[absCol+3] = { v: 'ផ្សេងៗ', t: 's', s: TH_STYLE }; merges.push({s:{r:startRow, c:absCol+3}, e:{r:startRow+2, c:absCol+3}})

        for(let i=1; i<=daysCount; i++) {
            const d = new Date(year, month, i)
            const isSun = d.getDay() === 0
            const st1 = isSun ? { ...TH_STYLE, font: { ...FONT_BOLD, color: { rgb: "FFDC2626" } }, fill: { fgColor: { rgb: "FFFFF1F1" } } } : TH_STYLE
            const st2 = isSun ? { ...TH_VERT, font: { ...FONT_BOLD, color: { rgb: "FFDC2626" } }, fill: { fgColor: { rgb: "FFFFF1F1" } } } : TH_VERT
            
            th2[1+i] = { v: i, t: 'n', s: st1 }
            th3[1+i] = { v: days[d.getDay()], t: 's', s: st2 }
        }

        th3[absCol] = { v: 'ច្បាប់', t: 's', s: TH_VERT }
        th3[absCol+1] = { v: 'អត់ច្បាប់', t: 's', s: TH_VERT }
        th3[absCol+2] = { v: 'សរុប', t: 's', s: TH_VERT }

        ws_data.push(th1, th2, th3)

        // Body Data
        const TD_STYLE = { font: FONT_NORMAL, alignment: ALIGN_CENTER, border: BORDER }
        const TD_NAME = { font: FONT_BOLD, alignment: ALIGN_LEFT, border: BORDER }
        
        for (let i = 0; i < Math.min(studentCount, initialStudents.length); i++) {
            const student = initialStudents[i]
            const row = Array(totalCols).fill(null).map(() => emptyCell(TD_STYLE))
            row[0] = { v: i + 1, t: 'n', s: TD_STYLE }
            row[1] = { v: student ? (student.name_kh || student.full_name) : '', t: 's', s: TD_NAME }

            let lCount = 0
            let aCount = 0

            for (let d = 1; d <= daysCount; d++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                let statusChar = ""
                
                const stuId = student.id || student.uid || ''
                if (student && attendance[dateStr] && attendance[dateStr][stuId]) {
                    const status = attendance[dateStr][stuId].status
                    if (status === 'P') statusChar = "✓" 
                    else if (status === 'L') { statusChar = "ច"; lCount++ } 
                    else if (status === 'A') { statusChar = "អ"; aCount++ }
                }

                const dateObj = new Date(year, month, d)
                const isSun = dateObj.getDay() === 0
                const cellStyle = isSun ? { ...TD_STYLE, font: { ...FONT_BOLD, color: { rgb: "FF1E3A8A" } }, fill: { fgColor: { rgb: "FFFFF1F1" } } } : { ...TD_STYLE, font: { ...FONT_BOLD, color: { rgb: "FF1E3A8A" } } }

                row[1 + d] = { v: statusChar, t: 's', s: cellStyle }
            }

            row[absCol] = { v: lCount > 0 ? lCount : '', t: lCount > 0 ? 'n' : 's', s: { ...TD_STYLE, font: { ...FONT_BOLD, color: { rgb: "FFD97706" } } } }
            row[absCol+1] = { v: aCount > 0 ? aCount : '', t: aCount > 0 ? 'n' : 's', s: { ...TD_STYLE, font: { ...FONT_BOLD, color: { rgb: "FFDC2626" } } } }
            row[absCol+2] = { v: (lCount + aCount) > 0 ? (lCount + aCount) : '', t: (lCount + aCount) > 0 ? 'n' : 's', s: { ...TD_STYLE, font: FONT_BOLD } }
            row[absCol+3] = { v: '', t: 's', s: TD_STYLE }

            ws_data.push(row)
        }

        // Footer Signatures Setup
        ws_data.push(Array(totalCols).fill(null).map(() => emptyCell()))
        ws_data.push(Array(totalCols).fill(null).map(() => emptyCell()))

        const fRow = ws_data.length
        
        const sigRow1 = Array(totalCols).fill(null).map(() => emptyCell())
        const sigRow2 = Array(totalCols).fill(null).map(() => emptyCell())
        const sigRow3 = Array(totalCols).fill(null).map(() => emptyCell())

        sigRow1[1] = { v: 'បានឃើញ និងឯកភាព', t: 's', s: { font: FONT_NORMAL, alignment: ALIGN_CENTER } }
        sigRow2[1] = { v: 'នាយកសាលា', t: 's', s: { font: FONT_MOUL, alignment: ALIGN_CENTER } }
        
        const rightMid = totalCols - 7
        sigRow1[rightMid] = { v: toKhmerLunarDate(today).lunarDateText, t: 's', s: { font: FONT_NORMAL, alignment: ALIGN_CENTER } }
        sigRow2[rightMid] = { v: `ត្រូវនឹងថ្ងៃទី ${toKhmerNumber(String(today.getDate()).padStart(2, '0'))} ខែ ${KHMER_MONTH_LABELS[today.getMonth()]} ឆ្នាំ ${toKhmerNumber(today.getFullYear())}`, t: 's', s: { font: FONT_NORMAL, alignment: ALIGN_CENTER } }
        sigRow3[rightMid] = { v: 'គ្រូបន្ទុកថ្នាក់', t: 's', s: { font: FONT_MOUL, alignment: ALIGN_CENTER } }

        merges.push({s:{r:fRow, c:1}, e:{r:fRow, c:6}})
        merges.push({s:{r:fRow+1, c:1}, e:{r:fRow+1, c:6}})
        
        merges.push({s:{r:fRow, c:rightMid}, e:{r:fRow, c:totalCols-1}})
        merges.push({s:{r:fRow+1, c:rightMid}, e:{r:fRow+1, c:totalCols-1}})
        merges.push({s:{r:fRow+2, c:rightMid}, e:{r:fRow+2, c:totalCols-1}})

        ws_data.push(sigRow1, sigRow2, sigRow3)
        ws_data.push(Array(totalCols).fill(null).map(() => emptyCell()))
        ws_data.push(Array(totalCols).fill(null).map(() => emptyCell()))
        ws_data.push(Array(totalCols).fill(null).map(() => emptyCell()))

        const sigNameRow = Array(totalCols).fill(null).map(() => emptyCell())
        sigNameRow[rightMid] = { v: '....................................', t: 's', s: { font: FONT_MOUL, alignment: ALIGN_CENTER } }
        merges.push({s:{r:ws_data.length, c:rightMid}, e:{r:ws_data.length, c:totalCols-1}})
        ws_data.push(sigNameRow)

        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet(ws_data)
        ws['!merges'] = merges
        
        const cols = [{ wch: 4 }, { wch: 25 }]
        for(let i=0; i<daysCount; i++) cols.push({ wch: 3.5 })
        cols.push({ wch: 4.5 }, { wch: 5.5 }, { wch: 4.5 })
        cols.push({ wch: 6 })
        ws['!cols'] = cols

        const rows: SheetRowMeta[] = []
        rows[startRow] = { hpt: 20 }
        rows[startRow+1] = { hpt: 20 }
        rows[startRow+2] = { hpt: 80 } 
        ws['!rows'] = rows

        XLSX.utils.book_append_sheet(wb, ws, "Attendance")
        XLSX.writeFile(wb, `បញ្ជីវត្តមានសិស្ស_ខែ${KHMER_MONTH_LABELS[month]}_${year}.xlsx`)
    }

    const downloadPDF = async () => {
        setIsDownloading(true)
        const printArea = document.getElementById('printArea')
        if (!printArea) return

        const opt = {
            margin:       0,
            filename:     `វត្តមានសិស្ស_ខែ${KHMER_MONTH_LABELS[month]}.pdf`,
            image:        { type: 'jpeg' as const, quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' as const },
            pagebreak:    { mode: ['css', 'legacy'] } 
        }

        try {
            await html2pdf().set(opt).from(printArea).save()
        } catch(e) {
            logger.error(e)
        }
        setIsDownloading(false)
    }

    const daysCount = new Date(year, month + 1, 0).getDate()

    // Render Preview HTML Pages for PDF
    const renderPages = () => {
        const pages = []
        const total = Math.min(studentCount, initialStudents.length)
        if (total === 0) return null

        let current = 1
        const maxFirst = 18
        const maxFirstSig = 12
        const maxOther = 25
        const maxOtherSig = 18

        let pageNum = 1

        const className = settings?.class_name || "........"
        const schoolName = settings?.school_name || "........"
        const teacherName = settings?.homeroom_teacher || "........"
        const managerRole = settings?.manager_role || "នាយកសាលា"

        const sy = month >= 8 ? year : year - 1
        const academicYearText = `ឆ្នាំសិក្សា ${toKhmerNumber(sy)}-${toKhmerNumber(sy + 1)}`
        const classDisplay = `ថ្នាក់៖ ${className}`

        while (current <= total) {
            const isFirst = pageNum === 1
            const remaining = total - current + 1
            const limitNoSig = isFirst ? maxFirst : maxOther
            const limitWithSig = isFirst ? maxFirstSig : maxOtherSig
            let end
            let isLast = false

            if (remaining <= limitWithSig) {
                end = current + remaining - 1
                isLast = true
            } else if (remaining > limitWithSig && remaining <= limitNoSig) {
                let takeCount = remaining - 3
                if (takeCount <= 0) takeCount = remaining
                end = current + takeCount - 1
                isLast = false
            } else {
                end = current + limitNoSig - 1
                isLast = false
            }

            pages.push(
                <div key={current} className="w-[297mm] h-[209mm] bg-white text-black p-[12mm_15mm] mx-auto box-border flex flex-col mb-[30px] break-inside-avoid shadow-[0_10px_25px_rgba(0,0,0,0.15)] relative overflow-hidden print:m-0 print:border-none print:shadow-none" style={{ pageBreakAfter: isLast ? 'auto' : 'always', pageBreakInside: 'avoid' }}>
                    {isFirst && (
                        <>
                            <div className="flex justify-between items-start mb-[15px] p-0 w-full">
                                <div className="w-1/3 text-center flex flex-col items-center">
                                    {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture */}
                                    <img src="/logo.png" className="h-[75px] w-auto mb-[5px] object-contain" alt="Logo" onError={(e) => (e.currentTarget.src = '/logo.png')} />
                                    <p className="font-moul text-[11pt] m-0 leading-[1.4]">{schoolName}</p>
                                </div>
                                <div className="w-1/3"></div>
                                <div className="w-1/3 text-center flex flex-col items-center">
                                    <h3 className="font-moul text-[13.5pt] m-0 mb-[5px]">ព្រះរាជាណាចក្រកម្ពុជា</h3>
                                    <h3 className="font-moul text-[12.5pt] m-0 mb-[5px]">ជាតិ សាសនា ព្រះមហាក្សត្រ</h3>
                                    {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture */}
                                    <img src="https://lh3.googleusercontent.com/d/1BnGzoisjHxGRiMbsrP-rZ1F9zvSfdtAh" className="h-[18px] mt-[4px]" alt="Line" />
                                </div>
                            </div>
                            
                            <div className="w-full text-center mb-[10px] mt-[5px]">
                                <h2 className="font-moul text-[12.5pt] m-0 mb-[10px]">សម្រង់អវត្តមានប្រចាំខែ {KHMER_MONTH_LABELS[month]}</h2>
                                <div className="flex justify-between w-full text-[11pt] font-bold mb-[5px]">
                                    <span className="text-[11.5pt]">{classDisplay}</span>
                                    <span className="text-[11.5pt]">{academicYearText}</span>
                                </div>
                            </div>
                        </>
                    )}

                    <table className="w-full border-collapse table-fixed border border-[#444] mx-auto mb-[10px]">
                        <thead>
                            <tr>
                                <th rowSpan={2} className="w-[28px] border border-[#444] bg-[#f8fafc] font-bold text-center align-middle p-[1px] text-[9.5pt] h-[24px]">ល.រ</th>
                                <th rowSpan={2} className="w-[175px] border border-[#444] bg-[#f8fafc] font-bold text-left align-middle pl-[5px] text-[9.5pt] h-[24px] whitespace-nowrap overflow-hidden text-ellipsis">គោត្តនាម និងនាម</th>
                                <th rowSpan={2} className="w-[30px] border border-[#444] bg-[#f8fafc] font-bold text-center align-middle p-[1px] text-[9pt] h-[24px]">ភេទ</th>
                                {Array.from({ length: daysCount }).map((_, i) => {
                                    const d = new Date(year, month, i + 1)
                                    const isSun = d.getDay() === 0
                                    return <th key={i} colSpan={2} className={`border border-[#444] bg-[#f8fafc] font-bold text-center align-middle p-[1px] text-[9.5pt] h-[24px] ${isSun ? 'bg-[#fff1f1] text-[#d93025]' : ''}`}>{toKhmerNumber(i + 1)}</th>
                                })}
                                <th colSpan={2} className="w-[45px] border border-[#444] bg-[#f8fafc] font-bold text-center align-middle p-[1px] text-[9.5pt] h-[24px]">សរុប</th>
                            </tr>
                            <tr>
                                {Array.from({ length: daysCount }).map((_, i) => {
                                    const d = new Date(year, month, i + 1)
                                    const isSun = d.getDay() === 0
                                    return (
                                        <React.Fragment key={i}>
                                            <th className={`border border-[#444] bg-[#f8fafc] font-bold text-center align-middle p-0 text-[8pt] h-[24px] ${isSun ? 'bg-[#fff1f1]' : ''}`}>អ</th>
                                            <th className={`border border-[#444] bg-[#f8fafc] font-bold text-center align-middle p-0 text-[8pt] h-[24px] ${isSun ? 'bg-[#fff1f1]' : ''}`}>ច្ប</th>
                                        </React.Fragment>
                                    )
                                })}
                                <th className="border border-[#444] bg-[#f8fafc] font-bold text-center align-middle p-0 text-[9.5pt] h-[24px]">អ</th>
                                <th className="border border-[#444] bg-[#f8fafc] font-bold text-center align-middle p-0 text-[9.5pt] h-[24px]">ច្ប</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from({ length: end - current + 1 }).map((_, idx) => {
                                const realIdx = current - 1 + idx
                                const student = initialStudents[realIdx]
                                let lCount = 0
                                let aCount = 0

                                return (
                                    <tr key={realIdx}>
                                        <td className="border border-[#444] text-center align-middle p-[1px] text-[9.5pt] h-[24px]">{toKhmerNumber(realIdx + 1)}</td>
                                        <td className="border border-[#444] font-bold text-left align-middle pl-[5px] text-[9.5pt] h-[24px] whitespace-nowrap overflow-hidden text-ellipsis">{student?.name_kh || student?.full_name}</td>
                                        <td className="border border-[#444] text-center align-middle p-[1px] text-[9pt] h-[24px]">{(student?.gender === 'ស្រី' || student?.gender === 'F') ? 'ស' : 'ប'}</td>
                                        
                                        {Array.from({ length: daysCount }).map((_, dIdx) => {
                                            const d = dIdx + 1
                                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                                            let aNum = 0
                                            let lNum = 0
                                            const stuId = student?.id || student?.uid || ''
                                            
                                            if (stuId && attendance[dateStr]?.[stuId]) {
                                                const status = attendance[dateStr][stuId].status
                                                if (status === 'L' || status === 'P') { lNum = 1; lCount++ }
                                                else if (status === 'A') { aNum = 1; aCount++ }
                                            }
                                            
                                            const isSun = new Date(year, month, d).getDay() === 0
                                            const aColor = aNum > 0 ? '#d93025' : '#777'
                                            const lColor = lNum > 0 ? '#1a73e8' : '#777'

                                            return (
                                                <React.Fragment key={dIdx}>
                                                    <td className={`border border-[#444] text-center align-middle p-0 text-[8pt] h-[24px] ${isSun ? 'bg-[#fff1f1]' : ''}`} style={{ color: aColor, fontWeight: aNum > 0 ? 'bold' : 'normal' }}>{aNum > 0 ? toKhmerNumber(aNum) : ''}</td>
                                                    <td className={`border border-[#444] text-center align-middle p-0 text-[8pt] h-[24px] ${isSun ? 'bg-[#fff1f1]' : ''}`} style={{ color: lColor, fontWeight: lNum > 0 ? 'bold' : 'normal' }}>{lNum > 0 ? toKhmerNumber(lNum) : ''}</td>
                                                </React.Fragment>
                                            )
                                        })}
                                        
                                        <td className="border border-[#444] text-center align-middle p-[1px] text-[10pt] h-[24px] text-[#d93025] font-bold">{aCount > 0 ? toKhmerNumber(aCount) : '០'}</td>
                                        <td className="border border-[#444] text-center align-middle p-[1px] text-[10pt] h-[24px] text-[#1a73e8] font-bold">{lCount > 0 ? toKhmerNumber(lCount) : '០'}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>

                    {isLast && (
                        <div className="flex justify-between items-start mt-[5px] px-[10px]">
                            <div className="w-[55%] text-left">
                                <p className="m-[2px_0] text-[11pt]">បញ្ឈប់បញ្ជីត្រឹមលេខរៀងទី {toKhmerNumber(end)} ត្រង់ឈ្មោះ {initialStudents[end - 1]?.name_kh || initialStudents[end - 1]?.full_name || "........................................"}។</p>
                                <p className="m-[2px_0] text-[11pt]">សរុប ៖ {toKhmerNumber(end)} នាក់ ស្រី {toKhmerNumber(initialStudents.slice(0, end).filter(s => s?.gender === 'ស្រី' || s?.gender === 'ស' || s?.gender === 'F').length)} នាក់។</p>
                                
                                <div className="text-center mt-[35px] w-[75%]">
                                    <p className="text-[11.5pt] mb-[5px] font-bold">បានឃើញ និងឯកភាព</p>
                                    <p className="font-moul text-[11.5pt]">{managerRole}</p>
                                </div>
                            </div>

                            <div className="w-[40%] text-center">
                                <p className="m-0 text-[10.5pt]">{toKhmerLunarDate(today).lunarDateText}</p>
                                <p className="m-0 text-[10.5pt]">ត្រូវនឹងថ្ងៃទី {toKhmerNumber(String(today.getDate()).padStart(2, '0'))} ខែ {KHMER_MONTH_LABELS[today.getMonth()]} ឆ្នាំ {toKhmerNumber(today.getFullYear())}</p>
                                <p className="font-moul text-[11.5pt] mt-[2px] mb-[40px]">គ្រូបន្ទុកថ្នាក់</p>
                                <p className="font-moul m-[45px] text-[11.5pt] relative left-[50px]">{teacherName}</p>
                            </div>
                        </div>
                    )}
                </div>
            )

            current = end + 1
            pageNum++
        }
        return pages
    }

    return (
        <div className="min-h-screen bg-[#f0f2f5] font-hanuman">
            <style jsx global>{`
                .font-moul { font-family: 'Moul', cursive; font-weight: normal; }
                .font-hanuman { font-family: 'Hanuman', serif; }
                @media print {
                    @page { size: A4 landscape; margin: 0; }
                    body { padding: 0; margin: 0; background: white; }
                    .print-hide { display: none !important; }
                }
            `}</style>

            {/* Top Navigation Matches Original */}
            <nav className="bg-[#0054a6] text-white p-3 md:p-4 shadow-lg sticky top-0 z-50 print-hide mb-5">
                <div className="container mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
                    <div className="flex items-center justify-between w-full md:w-auto gap-4">
                        <div className="flex items-center gap-2">
                            <Link href="/dashboard" className="flex items-center gap-1 md:gap-2 hover:text-yellow-400 transition font-bold text-xs md:text-sm bg-white/10 px-2 py-1.5 rounded-lg">
                                <span className="hidden sm:inline">ទំព័រដើម</span>
                            </Link>
                            <h1 className="kh-moul text-sm md:text-lg hidden lg:block">ប្រព័ន្ធគ្រប់គ្រងវត្តមាន</h1>
                        </div>
                        
                        <div className="flex items-center bg-white/10 rounded px-2 py-1 border border-white/20 shrink-0">
                            <span className="text-xs md:text-sm font-bold text-white px-2">ថ្នាក់ទី ១២ក</span>
                        </div>
                    </div>

                    <div className="flex gap-2 md:gap-4 text-xs md:text-sm font-bold items-center w-full md:w-auto overflow-x-auto no-scrollbar pb-1 md:pb-0 justify-start md:justify-end whitespace-nowrap">
                        <Link href="/attendance/monthly" className="text-yellow-400 flex items-center gap-1 px-2 py-1 bg-white/10 rounded transition">វត្តមានបញ្ជី</Link>
                        <Link href="/attendance/layout" className="hover:text-yellow-400 flex items-center gap-1 px-2 py-1 bg-white/5 rounded md:bg-transparent transition">វត្តមានប្លង់តុ</Link>
                    </div>
                </div>
            </nav>

            <div className="bg-white p-4 rounded-lg shadow-[0_4px_15px_rgba(0,0,0,0.1)] max-w-[1300px] mx-auto mb-5 print-hide flex gap-4 items-center justify-center flex-wrap border border-gray-200">
                <Link href="/dashboard" className="bg-[#475569] text-white px-5 py-2.5 rounded-md font-bold hover:opacity-90 transition">ត្រឡប់ក្រោយ</Link>
                
                <div className="flex items-center gap-2">
                    <label className="font-bold text-gray-700" htmlFor="monthly-attendance-month">ខែ៖</label>
                    <Select
                        id="monthly-attendance-month"
                        value={String(month)}
                        onChange={v => setMonth(parseInt(v))}
                        options={KHMER_MONTH_LABELS.map((m, i) => ({ value: String(i), label: m }))}
                    />
                </div>
                
                <div className="flex items-center gap-2">
                    <label className="font-bold text-gray-700">ឆ្នាំ៖</label>
                    <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="border border-gray-300 rounded p-2 outline-none focus:border-[#1a73e8] w-[80px]" />
                </div>
                
                <div className="flex items-center gap-2">
                    <label className="font-bold text-gray-700">ចំនួនសិស្ស៖</label>
                    <input type="number" value={studentCount} onChange={e => setStudentCount(parseInt(e.target.value))} max={100} min={1} className="border border-gray-300 rounded p-2 outline-none focus:border-[#1a73e8] w-[70px]" />
                </div>
                
                <button onClick={exportExcel} className="bg-[#16a34a] text-white px-5 py-2.5 rounded-md font-bold hover:opacity-90 transition flex items-center gap-2">ទាញយក Excel</button>
                <button onClick={downloadPDF} disabled={isDownloading} className="bg-[#d93025] text-white px-5 py-2.5 rounded-md font-bold hover:opacity-90 transition flex items-center gap-2">
                    {isDownloading ? 'កំពុងទាញយក...' : 'ទាញយក PDF'}
                </button>
                <button onClick={() => window.print()} className="bg-[#1a73e8] text-white px-5 py-2.5 rounded-md font-bold hover:opacity-90 transition flex items-center gap-2">បោះពុម្ព</button>
            </div>

            <div id="printArea" className="preview-scroll w-full max-w-[297mm] mx-auto">
                {renderPages()}
            </div>
        </div>
    )
}
