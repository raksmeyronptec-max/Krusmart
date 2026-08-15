'use client'

import { ArrowLeft, FileSpreadsheet, Printer } from 'lucide-react'
import Link from 'next/link'
import * as XLSX from 'xlsx-js-style'
import type { Settings, Student } from '@/lib/types'
import { ALIGN_CENTER, ALIGN_LEFT, emptyCell, khmerFont, moulFont, THIN_BORDER, type SheetMerge, type SheetRow } from '@/lib/utils/xlsx'

export default function PrintListClient({ initialStudents, settings }: { initialStudents: Student[], settings: Settings | null }) {

    const total = initialStudents.length
    const female = initialStudents.filter(s => s.gender === 'ស្រី' || s.gender === 'F').length

    const checkMark = '✓'

    const renderTick = (val: string | boolean | null | undefined, matchStr = 'បាទ/ចាស') => {
        return (val === matchStr || val === '✓' || val === true || val === 'ក្រ១' || val === 'ក្រ២') ? checkMark : ''
    }

    const cleanText = (str: string | null | undefined) => {
        return str ? str.trim() : ''
    }

    const trimPrefix = (str: string | null | undefined, prefixRegex: RegExp) => {
        if(!str) return ''
        return str.replace(prefixRegex, '').trim()
    }

    const formatDateDisplay = (dobStr: string | null | undefined) => {
        if(!dobStr || dobStr === '-') return '-'
        const parts = dobStr.split('-')
        if(parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
        return dobStr
    }

    const printList = () => {
        window.print()
    }

    const exportExcel = () => {
        if (initialStudents.length === 0) {
            alert("មិនមានទិន្នន័យដើម្បីទាញយកទេ!")
            return
        }

        const ws_data: SheetRow[] = []
        const merges: SheetMerge[] = []
        const className = settings?.class_name || 'Class'
        const year = settings?.academic_year || 'Year'

        const BORDER = THIN_BORDER
        const FONT_NORMAL = khmerFont(9)
        const FONT_BOLD = khmerFont(9, true)
        const FONT_MOUL = moulFont(11)
        
        const TH_STYLE = { font: FONT_BOLD, alignment: ALIGN_CENTER, border: BORDER, fill: { fgColor: { rgb: 'FFEFF6FF' } } }
        const TH_VERT = { ...TH_STYLE, alignment: { textRotation: 90, vertical: 'center', horizontal: 'center' } }
        const TD_STYLE = { font: FONT_NORMAL, alignment: ALIGN_CENTER, border: BORDER }
        const TD_LEFT = { font: FONT_NORMAL, alignment: ALIGN_LEFT, border: BORDER }

        
        const totalCols = 31 

        // Headers
        const r0 = Array(totalCols).fill(null).map(() => emptyCell())
        r0[0] = { v: 'ព្រះរាជាណាចក្រកម្ពុជា', t: 's', s: { font: FONT_MOUL, alignment: ALIGN_CENTER } }
        ws_data.push(r0); merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } })

        const r1 = Array(totalCols).fill(null).map(() => emptyCell())
        r1[0] = { v: 'ជាតិ សាសនា ព្រះមហាក្សត្រ', t: 's', s: { font: FONT_MOUL, alignment: ALIGN_CENTER } }
        ws_data.push(r1); merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } })

        ws_data.push(Array(totalCols).fill(null).map(() => emptyCell()))
        
        const r3 = Array(totalCols).fill(null).map(() => emptyCell())
        r3[0] = { v: 'បញ្ជីហៅឈ្មោះសិស្ស និងជីវប្រវត្តិសង្ខេប', t: 's', s: { font: { name: 'Khmer OS Moul Light', sz: 14 }, alignment: ALIGN_CENTER } }
        ws_data.push(r3); merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: totalCols - 1 } })
        
        const r4 = Array(totalCols).fill(null).map(() => emptyCell())
        r4[0] = { v: `សាលា៖ ${settings?.school_name || ''} | ${className} | ឆ្នាំសិក្សា៖ ${year}`, t: 's', s: { font: FONT_BOLD, alignment: ALIGN_CENTER } }
        ws_data.push(r4); merges.push({ s: { r: 4, c: 0 }, e: { r: 4, c: totalCols - 1 } })

        ws_data.push(Array(totalCols).fill(null).map(() => emptyCell()))

        const startRow = 6
        const tr1 = Array(totalCols).fill(null).map(() => emptyCell(TH_STYLE))
        const tr2 = Array(totalCols).fill(null).map(() => emptyCell(TH_STYLE))

        tr1[0] = { v: 'ល.រ', t: 's', s: TH_STYLE }; merges.push({ s: { r: startRow, c: 0 }, e: { r: startRow + 1, c: 0 } })
        tr1[1] = { v: 'អត្តលេខ', t: 's', s: TH_STYLE }; merges.push({ s: { r: startRow, c: 1 }, e: { r: startRow + 1, c: 1 } })
        tr1[2] = { v: 'គោត្តនាម និងនាម', t: 's', s: TH_STYLE }; merges.push({ s: { r: startRow, c: 2 }, e: { r: startRow + 1, c: 2 } })
        tr1[3] = { v: 'ភេទ', t: 's', s: TH_STYLE }; merges.push({ s: { r: startRow, c: 3 }, e: { r: startRow + 1, c: 3 } })
        tr1[4] = { v: 'ថ្ងៃខែឆ្នាំកំណើត', t: 's', s: TH_STYLE }; merges.push({ s: { r: startRow, c: 4 }, e: { r: startRow + 1, c: 4 } })
        
        tr1[5] = { v: 'ទីកន្លែងកំណើត', t: 's', s: TH_STYLE }; merges.push({ s: { r: startRow, c: 5 }, e: { r: startRow, c: 8 } })
        tr1[9] = { v: 'ទីលំនៅបច្ចុប្បន្ន', t: 's', s: TH_STYLE }; merges.push({ s: { r: startRow, c: 9 }, e: { r: startRow, c: 12 } })
        
        tr1[13] = { v: 'ឪពុក', t: 's', s: TH_STYLE }; merges.push({ s: { r: startRow, c: 13 }, e: { r: startRow, c: 14 } })
        tr1[15] = { v: 'ម្តាយ', t: 's', s: TH_STYLE }; merges.push({ s: { r: startRow, c: 15 }, e: { r: startRow, c: 16 } })
        tr1[17] = { v: 'អាណាព្យាបាល', t: 's', s: TH_STYLE }; merges.push({ s: { r: startRow, c: 17 }, e: { r: startRow, c: 18 } })
        
        tr1[19] = { v: 'លេខទូរសព្ទ', t: 's', s: TH_STYLE }; merges.push({ s: { r: startRow, c: 19 }, e: { r: startRow + 1, c: 19 } })
        
        tr1[20] = { v: 'ស្ថានភាព និងលក្ខណៈសិស្ស', t: 's', s: TH_STYLE }; merges.push({ s: { r: startRow, c: 20 }, e: { r: startRow, c: 29 } })

        tr2[5] = { v: 'ភូមិ', t: 's', s: TH_STYLE }; tr2[6] = { v: 'ឃុំ', t: 's', s: TH_STYLE }; tr2[7] = { v: 'ស្រុក', t: 's', s: TH_STYLE }; tr2[8] = { v: 'ខេត្ត', t: 's', s: TH_STYLE }
        tr2[9] = { v: 'ភូមិ', t: 's', s: TH_STYLE }; tr2[10] = { v: 'ឃុំ', t: 's', s: TH_STYLE }; tr2[11] = { v: 'ស្រុក', t: 's', s: TH_STYLE }; tr2[12] = { v: 'ខេត្ត', t: 's', s: TH_STYLE }
        
        tr2[13] = { v: 'ឈ្មោះ', t: 's', s: TH_STYLE }; tr2[14] = { v: 'មុខរបរ', t: 's', s: TH_STYLE }
        tr2[15] = { v: 'ឈ្មោះ', t: 's', s: TH_STYLE }; tr2[16] = { v: 'មុខរបរ', t: 's', s: TH_STYLE }
        tr2[17] = { v: 'ឈ្មោះ', t: 's', s: TH_STYLE }; tr2[18] = { v: 'មុខរបរ', t: 's', s: TH_STYLE }
        
        const statuses = ['សិស្សថ្មី', 'ត្រួតថ្នាក់', 'កំព្រា', 'ពិការ', 'ក្រ១', 'ក្រ២', 'សមធម៌', 'អាហារូបករណ៍', 'ជនជាតិភាគតិច', 'ផ្សេងៗ']
        for(let i=0; i<statuses.length; i++){
            tr2[20+i] = { v: statuses[i], t: 's', s: TH_VERT }
        }

        ws_data.push(tr1, tr2)

        const renderExcelTick = (val: string | boolean | null | undefined) => { return (val === true || val === 'ក្រ១' || val === 'ក្រ២') ? checkMark : '' }

        initialStudents.forEach((s, i) => {
            const row = Array(totalCols).fill(null).map(() => emptyCell(TD_STYLE))
            
            row[0] = { v: i + 1, t: 'n', s: TD_STYLE }
            row[1] = { v: s.id, t: 's', s: TD_STYLE }
            row[2] = { v: s.name_kh || s.full_name, t: 's', s: TD_LEFT }
            row[3] = { v: s.gender === 'ស្រី' || s.gender === 'F' ? 'ស' : 'ប', t: 's', s: TD_STYLE }
            row[4] = { v: formatDateDisplay(s.dob), t: 's', s: TD_STYLE }
            
            row[5] = { v: trimPrefix(s.birth_village, /^(ភូមិទី|ភូមិ)\s*/), t: 's', s: TD_STYLE }
            row[6] = { v: trimPrefix(s.birth_commune, /^(ឃុំ\/សង្កាត់|សង្កាត់|ឃុំ)\s*/), t: 's', s: TD_STYLE }
            row[7] = { v: trimPrefix(s.birth_district, /^(ស្រុក\/ខណ្ឌ|ខណ្ឌ|ស្រុក|ក្រុង)\s*/), t: 's', s: TD_STYLE }
            row[8] = { v: trimPrefix(s.birth_province, /^(ខេត្ត\/ក្រុង|រាជធានី\/ខេត្ត|រាជធានី|ខេត្ត)\s*/), t: 's', s: TD_STYLE }
            
            row[9] = { v: trimPrefix(s.curr_village, /^(ភូមិទី|ភូមិ)\s*/), t: 's', s: TD_STYLE }
            row[10] = { v: trimPrefix(s.curr_commune, /^(ឃុំ\/សង្កាត់|សង្កាត់|ឃុំ)\s*/), t: 's', s: TD_STYLE }
            row[11] = { v: trimPrefix(s.curr_district, /^(ស្រុក\/ខណ្ឌ|ខណ្ឌ|ស្រុក|ក្រុង)\s*/), t: 's', s: TD_STYLE }
            row[12] = { v: trimPrefix(s.curr_province, /^(ខេត្ត\/ក្រុង|រាជធានី\/ខេត្ត|រាជធានី|ខេត្ត)\s*/), t: 's', s: TD_STYLE }
            
            row[13] = { v: cleanText(s.father_name), t: 's', s: TD_STYLE }; row[14] = { v: cleanText(s.father_job), t: 's', s: TD_STYLE }
            row[15] = { v: cleanText(s.mother_name), t: 's', s: TD_STYLE }; row[16] = { v: cleanText(s.mother_job), t: 's', s: TD_STYLE }
            row[17] = { v: cleanText(s.guardian_name), t: 's', s: TD_STYLE }; row[18] = { v: cleanText(s.guardian_job), t: 's', s: TD_STYLE }
            
            row[19] = { v: cleanText(s.phone), t: 's', s: TD_STYLE }
            
            row[20] = { v: renderExcelTick(s.is_new_student), t: 's', s: TD_STYLE }
            row[21] = { v: renderExcelTick(s.is_repeater), t: 's', s: TD_STYLE }
            row[22] = { v: renderExcelTick(s.orphan_status), t: 's', s: TD_STYLE }
            row[23] = { v: renderExcelTick(s.is_disabled), t: 's', s: TD_STYLE }
            row[24] = { v: s.poor_status === 'ក្រ១' ? checkMark : '', t: 's', s: TD_STYLE }
            row[25] = { v: s.poor_status === 'ក្រ២' ? checkMark : '', t: 's', s: TD_STYLE }
            row[26] = { v: renderExcelTick(s.is_equity), t: 's', s: TD_STYLE }
            row[27] = { v: renderExcelTick(s.is_scholarship), t: 's', s: TD_STYLE }
            row[28] = { v: cleanText(s.ethnicity), t: 's', s: TD_STYLE }
            row[29] = { v: cleanText(s.other_remarks), t: 's', s: TD_STYLE }

            ws_data.push(row)
        })

        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet(ws_data)
        ws['!merges'] = merges
        
        const cols = [
            { wch: 4 }, { wch: 10 }, { wch: 20 }, { wch: 5 }, { wch: 12 }, 
            { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, 
            { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, 
            { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 10 }, 
            { wch: 12 } 
        ]
        for(let i=20; i<totalCols; i++) cols.push({ wch: 5 })
        ws['!cols'] = cols

        const rows = []
        rows[7] = { hpt: 60 } 
        ws['!rows'] = rows

        XLSX.utils.book_append_sheet(wb, ws, "Students")
        XLSX.writeFile(wb, `បញ្ជីជីវប្រវត្តិសិស្ស_${className}_${year}.xlsx`)
    }

    return (
        <div className="bg-[#f1f5f9] min-h-screen text-[#0f172a] font-battambang pb-10 print:bg-bg-surface print:m-0 print:p-0">
            <style jsx global>{`
                .font-battambang { font-family: 'Battambang', cursive; }

                @media print {
                    @page {
                        size: A4 landscape;
                        margin: 5mm; 
                    }
                    body { background: white !important; margin: 0; padding: 0; font-size: 8pt; }
                    .no-print { display: none !important; }
                    .print-container { width: 100% !important; box-shadow: none !important; border: none !important; padding: 0 !important; max-width: none !important; margin: 0 !important; }
                    
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    
                    .table-container { overflow: visible !important; }
                }

                .report-table { width: 100%; border-collapse: collapse; font-size: 9px; }
                .report-table th, .report-table td {
                    border: 1px solid #1e293b;
                    padding: 2px 3px;
                    text-align: center;
                    vertical-align: middle;
                    word-break: break-word;
                }
                .report-table th {
                    background-color: #f8fafc;
                    color: #1e3a8a;
                    font-weight: bold;
                }
                
                .vertical-text {
                    writing-mode: vertical-rl;
                    transform: rotate(180deg);
                    white-space: nowrap;
                    height: 90px;
                    text-align: left;
                    padding: 2px;
                    font-weight: bold;
                    font-size: 8.5px;
                }

                .w-no { width: 20px; }
                .w-id { width: 45px; }
                .w-name { width: 110px; text-align: left !important; padding-left: 4px !important; }
                .w-sex { width: 25px; }
                .w-dob { width: 60px; }
                .w-loc { width: 45px; font-size: 8px; }
                .w-parent { width: 60px; font-size: 8px; }
                .w-job { width: 40px; font-size: 8px; }
                .w-phone { width: 55px; font-size: 8px; }
                .w-status { width: 20px; }
                .w-other { width: 50px; font-size: 8px; }
            `}</style>

            <div className="no-print bg-bg-surface shadow-md border-b border-divider sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard" className="p-2 bg-paper hover:bg-divider rounded-lg text-text-body transition">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="text-lg font-bold text-brand-800 kh-moul mt-1">បោះពុម្ពបញ្ជីជីវប្រវត្តិសិស្ស</h1>
                    </div>

                    <div className="flex gap-2 ml-auto">
                        <button onClick={exportExcel} className="flex items-center gap-2 bg-success hover:opacity-90 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition">
                            <FileSpreadsheet className="w-4 h-4" /> ទាញយក Excel
                        </button>
                        <button onClick={printList} className="flex items-center gap-2 bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition">
                            <Printer className="w-4 h-4" /> បោះពុម្ព
                        </button>
                    </div>
                </div>
            </div>

            <div className="preview-scroll">
            <div className="w-[297mm] max-w-none mx-auto bg-white min-h-[210mm] mt-6 shrink-0 shadow-xl border border-slate-200 p-[8mm] print-container mb-10">
                
                <div className="relative mb-[15px]">
                    <div className="text-[11px] kh-moul text-black leading-relaxed max-w-[50%]">
                        <div>{settings?.management_unit_1 || "មន្ទីរអប់រំ យុវជន និងកីឡា..."}</div>
                        <div>{settings?.management_unit_2 || "ការិយាល័យអប់រំ យុវជន និងកីឡា..."}</div>
                        <div>{settings?.school_name || "សាលាបឋមសិក្សា..."}</div>
                        <div className="mt-1 font-sans font-bold">លេខកូដសាលា៖ <span>{settings?.school_code || "..."}</span></div>
                    </div>

                    <div className="absolute top-0 right-0 text-center">
                        <h2 className="kh-moul text-[13px] text-black tracking-wide">ព្រះរាជាណាចក្រកម្ពុជា</h2>
                        <h3 className="kh-moul text-[13px] text-black mt-1 tracking-wider">ជាតិ សាសនា ព្រះមហាក្សត្រ</h3>
                        <div className="flex justify-center mt-1">
                            <span className="text-[10px]">❧❧❧ ❖ ☙☙☙</span>
                        </div>
                    </div>

                    <div className="text-center mt-4">
                        <h1 className="kh-moul text-lg text-black">បញ្ជីហៅឈ្មោះសិស្ស</h1>
                        <h2 className="kh-moul text-base text-black mt-1">ផ្នែកជីវប្រវត្តិសង្ខេបរបស់សិស្ស</h2>
                    </div>

                    <div className="flex justify-between items-end mt-4 text-[11px] font-bold text-black px-2">
                        <div><span className="text-blue-800">{settings?.class_name || "..."}</span> <span className="ml-2">ឆ្នាំសិក្សា <span className="text-blue-800">{settings?.academic_year || "..."}</span></span></div>
                        <div>ឈ្មោះគ្រូ៖ <span className="text-blue-800 kh-moul">{settings?.teacher_name || "..."}</span></div>
                        <div>សិស្សសរុប៖ <span className="text-blue-800">{total}</span> នាក់</div>
                        <div>ស្រី៖ <span className="text-blue-800">{female}</span> នាក់</div>
                    </div>
                </div>

                <div className="table-container w-full overflow-x-auto mt-2">
                    <table className="report-table">
                        <thead>
                            <tr>
                                <th rowSpan={2} className="w-no">ល.រ</th>
                                <th rowSpan={2} className="w-id">អត្តលេខ</th>
                                <th rowSpan={2} className="w-name">គោត្តនាម និងនាម</th>
                                <th rowSpan={2} className="w-sex">ភេទ</th>
                                <th rowSpan={2} className="w-dob">ថ្ងៃខែឆ្នាំកំណើត</th>
                                
                                <th colSpan={4} className="bg-blue-50/50">ទីកន្លែងកំណើត</th>
                                <th colSpan={4} className="bg-green-50/50">ទីលំនៅបច្ចុប្បន្ន</th>
                                
                                <th colSpan={2} className="bg-orange-50/50">ឪពុក</th>
                                <th colSpan={2} className="bg-orange-50/50">ម្តាយ</th>
                                <th colSpan={2} className="bg-orange-50/50">អាណាព្យាបាល</th>
                                
                                <th rowSpan={2} className="w-phone">លេខទូរសព្ទ</th>
                                
                                <th colSpan={10} className="bg-purple-50/50">ស្ថានភាព និងលក្ខណៈសិស្ស</th>
                            </tr>
                            <tr>
                                <th className="w-loc bg-blue-50/50">ភូមិ</th><th className="w-loc bg-blue-50/50">ឃុំ/សង្កាត់</th><th className="w-loc bg-blue-50/50">ស្រុក/ខណ្ឌ</th><th className="w-loc bg-blue-50/50">ខេត្ត/ក្រុង</th>
                                <th className="w-loc bg-green-50/50">ភូមិ</th><th className="w-loc bg-green-50/50">ឃុំ/សង្កាត់</th><th className="w-loc bg-green-50/50">ស្រុក/ខណ្ឌ</th><th className="w-loc bg-green-50/50">ខេត្ត/ក្រុង</th>
                                <th className="w-parent bg-orange-50/50">ឈ្មោះ</th><th className="w-job bg-orange-50/50">មុខរបរ</th>
                                <th className="w-parent bg-orange-50/50">ឈ្មោះ</th><th className="w-job bg-orange-50/50">មុខរបរ</th>
                                <th className="w-parent bg-orange-50/50">ឈ្មោះ</th><th className="w-job bg-orange-50/50">មុខរបរ</th>
                                <th className="w-status bg-purple-50/50"><div className="vertical-text">សិស្សថ្មី</div></th>
                                <th className="w-status bg-purple-50/50"><div className="vertical-text">សិស្សត្រួតថ្នាក់</div></th>
                                <th className="w-status bg-purple-50/50"><div className="vertical-text">សិស្សកំព្រា</div></th>
                                <th className="w-status bg-purple-50/50"><div className="vertical-text">សិស្សពិការ</div></th>
                                <th className="w-status bg-purple-50/50"><div className="vertical-text text-red-600">ក្រ១</div></th>
                                <th className="w-status bg-purple-50/50"><div className="vertical-text text-red-600">ក្រ២</div></th>
                                <th className="w-status bg-purple-50/50"><div className="vertical-text">សមធម៌</div></th>
                                <th className="w-status bg-purple-50/50"><div className="vertical-text">អាហារូបករណ៍</div></th>
                                <th className="w-other bg-purple-50/50">ជនជាតិ<br/>ភាគតិច</th>
                                <th className="w-other bg-purple-50/50">ផ្សេងៗ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {initialStudents.length === 0 ? (
                                <tr><td colSpan={31} className="py-8 text-center text-slate-500">មិនមានទិន្នន័យសិស្សទេ សូមបញ្ចូលទិន្នន័យសិស្សជាមុនសិន។</td></tr>
                            ) : initialStudents.map((s, index) => (
                                <tr key={s.id}>
                                    <td>{index + 1}</td>
                                    <td className="font-mono text-blue-700 font-bold text-[8px]">{s.id}</td>
                                    <td className="w-name font-bold text-blue-900">{s.name_kh || s.full_name}</td>
                                    <td>{s.gender === 'ស្រី' || s.gender === 'F' ? 'ស' : 'ប'}</td>
                                    <td>{formatDateDisplay(s.dob)}</td>
                                    
                                    <td className="text-[8px] text-slate-700">{trimPrefix(s.birth_village, /^(ភូមិទី|ភូមិ)\s*/)}</td>
                                    <td className="text-[8px] text-slate-700">{trimPrefix(s.birth_commune, /^(ឃុំ\/សង្កាត់|សង្កាត់|ឃុំ)\s*/)}</td>
                                    <td className="text-[8px] text-slate-700">{trimPrefix(s.birth_district, /^(ស្រុក\/ខណ្ឌ|ខណ្ឌ|ស្រុក|ក្រុង)\s*/)}</td>
                                    <td className="text-[8px] text-slate-700">{trimPrefix(s.birth_province, /^(ខេត្ត\/ក្រុង|រាជធានី\/ខេត្ត|រាជធានី|ខេត្ត)\s*/)}</td>
                                    
                                    <td className="text-[8px] text-slate-700">{trimPrefix(s.curr_village, /^(ភូមិទី|ភូមិ)\s*/)}</td>
                                    <td className="text-[8px] text-slate-700">{trimPrefix(s.curr_commune, /^(ឃុំ\/សង្កាត់|សង្កាត់|ឃុំ)\s*/)}</td>
                                    <td className="text-[8px] text-slate-700">{trimPrefix(s.curr_district, /^(ស្រុក\/ខណ្ឌ|ខណ្ឌ|ស្រុក|ក្រុង)\s*/)}</td>
                                    <td className="text-[8px] text-slate-700">{trimPrefix(s.curr_province, /^(ខេត្ត\/ក្រុង|រាជធានី\/ខេត្ត|រាជធានី|ខេត្ត)\s*/)}</td>
                                    
                                    <td className="text-[8px] text-slate-800">{cleanText(s.father_name) || '-'}</td>
                                    <td className="text-[8px] text-slate-600">{cleanText(s.father_job) || '-'}</td>
                                    
                                    <td className="text-[8px] text-slate-800">{cleanText(s.mother_name) || '-'}</td>
                                    <td className="text-[8px] text-slate-600">{cleanText(s.mother_job) || '-'}</td>
                                    
                                    <td className="text-[8px] text-slate-800">{cleanText(s.guardian_name) || '-'}</td>
                                    <td className="text-[8px] text-slate-600">{cleanText(s.guardian_job) || '-'}</td>
                                    
                                    <td className="text-[8px]">{cleanText(s.phone) || '-'}</td>
                                    
                                    <td>{renderTick(s.is_new_student)}</td>
                                    <td>{renderTick(s.is_repeater)}</td>
                                    <td>{renderTick(s.orphan_status)}</td>
                                    <td>{renderTick(s.is_disabled)}</td>
                                    <td className="text-green-600 font-bold">{s.poor_status === 'ក្រ១' ? checkMark : ''}</td>
                                    <td className="text-green-600 font-bold">{s.poor_status === 'ក្រ២' ? checkMark : ''}</td>
                                    <td>{renderTick(s.is_equity)}</td>
                                    <td>{renderTick(s.is_scholarship)}</td>
                                    
                                    <td className="text-[8px]">{cleanText(s.ethnicity) || '-'}</td>
                                    <td className="text-[8px] text-slate-500">{cleanText(s.other_remarks) || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-8 flex justify-between text-[11px] font-bold text-black px-8">
                    <div className="text-center">
                        <p className="mb-1">បានឃើញ និងឯកភាព</p>
                        <p className="kh-moul mt-2">{settings?.director_name || "នាយកសាលា"}</p>
                        <div className="h-20"></div>
                    </div>

                    <div className="text-center">
                        <p className="mb-1 kh-moul">ថ្ងៃ...........ខែ.........ឆ្នាំ...........ព.ស ២៥៦...</p>
                        <p className="mb-1 kh-moul">ធ្វើនៅ<span>{settings?.province_date || ".............."}</span>ថ្ងៃទី.......ខែ...........ឆ្នាំ២០២...</p>
                        
                        <p className="kh-moul mt-3">គ្រូបន្ទុកថ្នាក់</p>
                        <div className="h-16"></div>
                        <p className="kh-moul text-blue-800" style={{ marginLeft: '2cm' }}>{settings?.teacher_name || "ឈ្មោះគ្រូ"}</p>
                    </div>
                </div>
            </div>
            </div>
        </div>
    )
}
