'use client'

import { useState } from 'react'
import { ArrowLeft, Book, Printer, PenTool, Search, Users } from 'lucide-react'
import Link from 'next/link'

export default function StudentTrackingClient({ initialStudents, attendanceData, scoresData, settings, academicYear }: { 
    initialStudents: any[], attendanceData: any[], scoresData: any[], settings: any, academicYear: string 
}) {
    const [selectedYear, setSelectedYear] = useState(academicYear)
    const [searchTerm, setSearchTerm] = useState('')
    const [reportType, setReportType] = useState('monthly')
    const [selectedMonth, setSelectedMonth] = useState('01')

    const getGrade = (avg: number | null) => {
        if (avg === null) return '-'
        if (avg >= 9) return 'A'
        if (avg >= 8) return 'B'
        if (avg >= 7) return 'C'
        if (avg >= 6) return 'D'
        if (avg >= 5) return 'E'
        return 'F'
    }

    const filteredStudents = initialStudents.filter(s => 
        (s.name_kh || s.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.id.includes(searchTerm)
    )

    const printStudent = (studentId: string) => {
        // Find element and isolate it for printing
        const contents = document.getElementById(`print-content-${studentId}`)
        if (!contents) return

        const originalBody = document.body.innerHTML
        document.body.innerHTML = contents.outerHTML
        window.print()
        document.body.innerHTML = originalBody
        window.location.reload()
    }

    const printAll = () => {
        const contents = document.getElementById('all-prints-container')
        if (!contents) return
        
        const originalBody = document.body.innerHTML
        document.body.innerHTML = contents.outerHTML
        window.print()
        document.body.innerHTML = originalBody
        window.location.reload()
    }

    // Helper to get score for a specific month for a student
    const getStudentScoreData = (uid: string) => {
        let mData = scoresData.find(d => d.month === selectedMonth && d.year === selectedYear)
        if (!mData) return null
        
        const data = typeof mData.data === 'string' ? JSON.parse(mData.data) : mData.data
        if (data && data[uid]) {
            return data[uid]
        }
        return null
    }

    return (
        <div className="min-h-screen bg-[#f0f4f8] text-slate-800 font-battambang pb-10 print:bg-white print:m-0 print:p-0">
            <style jsx global>{`
                .font-moul { font-family: 'Moul', cursive; font-weight: normal; }
                .font-battambang { font-family: 'Battambang', cursive; }

                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 0; 
                    }
                    body { background: white !important; margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
                    .no-print { display: none !important; }
                    .print-container { 
                        display: block !important; 
                        width: 100%;
                        height: 100%;
                        box-shadow: none !important;
                        padding: 1cm 1.2cm !important;
                        margin: 0 !important;
                        page-break-after: always;
                    }
                    .print-container:last-child {
                        page-break-after: auto;
                    }
                    .report-table th { background-color: #eff6ff !important; -webkit-print-color-adjust: exact; }
                }

                .report-table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-top: 4px; line-height: 1.1; color: #1e40af; }
                .report-table th, .report-table td { border: 1px solid #1e40af; padding: 3px 4px; text-align: center; vertical-align: middle; }
                .report-table th { font-family: 'Moul', cursive; font-size: 11px; font-weight: normal; }
                
            `}</style>

            <div className="no-print max-w-5xl mx-auto px-4 mt-8">
                <div className="flex justify-between items-center mb-6">
                    <Link href="/dashboard" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-bold transition">
                        <ArrowLeft className="w-5 h-5" /> ត្រឡប់ទៅទំព័រដើម
                    </Link>
                    
                    <div className="flex gap-2 flex-wrap justify-end">
                        <button onClick={printAll} className="px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 text-sm bg-green-600 text-white shadow-md hover:bg-green-700 transition-all">
                            <Printer className="w-4 h-4" /> បោះពុម្ពសិស្សទាំងអស់
                        </button>
                    </div>
                </div>

                <div className="bg-white/95 backdrop-blur border border-white/50 rounded-2xl p-6 md:p-8 text-center shadow-lg">
                    <h1 className="font-moul text-xl md:text-2xl text-blue-600 mb-8">បង្ហាញលទ្ធផលសិក្សាតាមសិស្ស (A4)</h1>

                    <div className="mb-8 flex justify-center">
                        <div className="inline-flex bg-gray-50 border border-gray-200 p-1.5 rounded-2xl flex-wrap justify-center gap-1 shadow-sm">
                            <button onClick={() => setReportType('monthly')} className={`px-6 py-2 rounded-xl font-bold transition flex items-center gap-2 ${reportType === 'monthly' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}>
                                ប្រចាំខែ
                            </button>
                            <button onClick={() => setReportType('semester')} className={`px-6 py-2 rounded-xl font-bold transition flex items-center gap-2 ${reportType === 'semester' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}>
                                ប្រចាំឆមាស
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left mb-8 max-w-2xl mx-auto">
                        <div>
                            <label className="block font-bold text-gray-700 mb-2 text-sm ml-1">ឆ្នាំសិក្សា</label>
                            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="w-full padding-3 rounded-xl border border-gray-200 outline-none bg-gray-50 p-2 font-bold">
                                <option value="2024-2025">2024-2025</option>
                                <option value="2025-2026">2025-2026</option>
                            </select>
                        </div>

                        <div>
                            <label className="block font-bold text-gray-700 mb-2 text-sm ml-1">ជ្រើសរើសខែ</label>
                            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full padding-3 rounded-xl border border-gray-200 outline-none bg-gray-50 p-2 font-bold">
                                <option value="01">មករា</option>
                                <option value="02">កុម្ភៈ</option>
                                <option value="03">មីនា</option>
                                <option value="04">មេសា</option>
                                <option value="05">ឧសភា</option>
                                <option value="06">មិថុនា</option>
                                <option value="07">កក្កដា</option>
                                <option value="08">សីហា</option>
                                <option value="09">កញ្ញា</option>
                                <option value="10">តុលា</option>
                                <option value="11">វិច្ឆិកា</option>
                                <option value="12">ធ្នូ</option>
                            </select>
                        </div>
                    </div>

                    <hr className="border-gray-200 mb-6" />

                    <div className="text-left">
                        <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                            <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                                <Users className="w-5 h-5 text-blue-500" /> ជ្រើសរើសសិស្សខាងក្រោម៖
                            </h2>
                            
                            <div className="relative w-full md:w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="ស្វែងរកឈ្មោះ..." className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 outline-none bg-gray-50 font-bold text-sm shadow-sm" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[450px] overflow-y-auto pr-2 pb-4">
                            {filteredStudents.map(student => (
                                <div key={student.id} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between" onClick={() => printStudent(student.id)}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex justify-center items-center font-bold text-lg shrink-0">
                                            {student.gender === 'ស្រី' || student.gender === 'F' ? 'ស' : 'ប'}
                                        </div>
                                        <div className="overflow-hidden">
                                            <div className="font-bold text-slate-800 truncate">{student.name_kh || student.full_name}</div>
                                            <div className="text-xs text-slate-500">អត្តលេខ៖ {student.id}</div>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                                        <div className="text-xs font-bold text-slate-600">ពិន្ទុ: <span className="text-blue-600">{getStudentScoreData(student.id)?.average || '-'}</span></div>
                                        <div className="text-xs font-bold text-slate-600">និទ្ទេស: <span className="text-red-500">{getGrade(parseFloat(getStudentScoreData(student.id)?.average))}</span></div>
                                    </div>
                                    <button className="mt-3 w-full bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold py-1.5 rounded-lg text-xs transition flex justify-center items-center gap-1">
                                        <Printer className="w-3 h-3" /> បោះពុម្ព
                                    </button>
                                </div>
                            ))}
                            {filteredStudents.length === 0 && (
                                <div className="col-span-full text-center py-10 text-gray-500">
                                    មិនមានសិស្សនោះទេ!
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Hidden Print Container */}
            <div id="all-prints-container" className="hidden print:block w-full">
                {filteredStudents.map((student, index) => {
                    const studentScore = getStudentScoreData(student.id)

                    return (
                    <div key={student.id} id={`print-content-${student.id}`} className="print-container bg-white w-[21cm] min-h-[29.7cm] mx-auto p-[1cm_1.2cm] relative page-break-after-always">
                        {/* Header Section */}
                        <div className="flex justify-between items-start mb-4">
                            <div className="text-center text-[13px] font-moul leading-relaxed w-1/3 text-blue-900">
                                <div>{settings.management_unit_1 || "មន្ទីរអប់រំ យុវជន និងកីឡា..."}</div>
                                <div>{settings.management_unit_2 || "ការិយាល័យអប់រំ យុវជន និងកីឡា..."}</div>
                                <div>{settings.school_name || "សាលាបឋមសិក្សា..."}</div>
                            </div>
                            
                            <div className="flex-1 flex justify-center">
                                <div className="text-center w-full max-w-[200px]">
                                    <h2 className="font-moul text-[15px] mb-1">ព្រះរាជាណាចក្រកម្ពុជា</h2>
                                    <h3 className="font-moul text-[15px] mb-1">ជាតិ សាសនា ព្រះមហាក្សត្រ</h3>
                                    <div className="flex justify-center text-xs">
                                        <span>❧❧❧ ❖ ☙☙☙</span>
                                    </div>
                                </div>
                            </div>

                            <div className="w-1/3 text-right">
                                {/* Optional Logo Placeholder */}
                            </div>
                        </div>

                        {/* Title */}
                        <div className="text-center mb-4 text-[#1e40af]">
                            <h1 className="font-moul text-lg mb-1 tracking-wider">សៀវភៅតាមដានលទ្ធផលសិក្សារបស់សិស្ស</h1>
                            <div className="inline-block border-2 border-[#1e40af] px-4 py-1.5 rounded-lg font-bold text-sm bg-blue-50/50 shadow-sm">
                                ថ្នាក់ទី {settings.class_name || "១២ ក"} | ឆ្នាំសិក្សា {selectedYear}
                            </div>
                        </div>

                        {/* Student Info Box */}
                        <div className="border border-[#1e40af] rounded-xl p-3 mb-4 bg-[#eff6ff]/30 shadow-sm relative">
                            <div className="absolute top-0 right-0 bg-[#1e40af] text-white px-3 py-1 rounded-bl-xl rounded-tr-xl font-bold text-xs shadow-sm">
                                {reportType === 'monthly' ? `ខែទី ${selectedMonth}` : 'ឆមាសទី១'}
                            </div>
                            <div className="grid grid-cols-2 gap-y-2 text-[13px]">
                                <div><span className="text-slate-500 font-bold">គោត្តនាម និងនាម៖</span> <span className="font-moul text-[#1e40af] text-[14px] ml-1">{student.name_kh || student.full_name}</span></div>
                                <div><span className="text-slate-500 font-bold">ភេទ៖</span> <span className="font-bold text-[#1e40af] ml-1">{student.gender === 'ស្រី' || student.gender === 'F' ? 'ស្រី' : 'ប្រុស'}</span></div>
                                <div><span className="text-slate-500 font-bold">ថ្ងៃខែឆ្នាំកំណើត៖</span> <span className="font-bold text-[#1e40af] ml-1">{student.dob || '-'}</span></div>
                                <div><span className="text-slate-500 font-bold">អត្តលេខ៖</span> <span className="font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded text-xs ml-1">{student.id}</span></div>
                            </div>
                        </div>

                        {/* Score Table */}
                        <table className="report-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}>ល.រ</th>
                                    <th>មុខវិជ្ជាសិក្សា</th>
                                    <th style={{ width: '60px' }}>ពិន្ទុអតិ.</th>
                                    <th style={{ width: '80px' }}>ពិន្ទុទទួលបាន</th>
                                    <th style={{ width: '80px' }}>មធ្យមភាគ</th>
                                    <th style={{ width: '120px' }}>និទ្ទេស/កម្រិតវាយតម្លៃ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Sample rows to match aesthetics */}
                                {['អំណាន', 'សរសេរតាមអាន', 'តែងសេចក្តី', 'គណិតវិទ្យា', 'វិទ្យាសាស្ត្រ', 'សិក្សាសង្គម'].map((subj, idx) => (
                                    <tr key={idx}>
                                        <td className="font-bold text-slate-500">{idx + 1}</td>
                                        <td className="text-left font-bold pl-2 text-slate-800">{subj}</td>
                                        <td className="font-bold">10</td>
                                        <td className="font-bold text-blue-700">{studentScore?.[subj] || '0.00'}</td>
                                        <td rowSpan={idx === 0 ? 6 : 1} className={idx === 0 ? "align-middle font-bold text-lg bg-blue-50/30" : "hidden"}>
                                            {idx === 0 ? (studentScore?.average || '0.00') : ''}
                                        </td>
                                        <td rowSpan={idx === 0 ? 6 : 1} className={idx === 0 ? "align-middle font-bold text-lg bg-blue-50/30 text-red-600" : "hidden"}>
                                            {idx === 0 ? getGrade(parseFloat(studentScore?.average)) : ''}
                                        </td>
                                    </tr>
                                ))}
                                
                                <tr className="bg-summary font-bold">
                                    <td colSpan={3} className="text-right pr-2">សរុបពិន្ទុរួម</td>
                                    <td className="text-blue-800 text-base">{studentScore?.total || '0.00'}</td>
                                    <td colSpan={2} className="text-red-600 text-sm">ចំណាត់ថ្នាក់ទី: {studentScore?.rank || '-'}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div className="mt-8 flex justify-between px-8 text-sm">
                            <div className="text-center font-moul leading-relaxed">
                                <div>បានឃើញ និងឯកភាព</div>
                                <div className="text-xs font-battambang mt-1 text-slate-500">ហត្ថលេខា និងឈ្មោះនាយកសាលា</div>
                                <div className="h-24"></div>
                                <div>{settings.director_name || "នាយកសាលា"}</div>
                            </div>
                            
                            <div className="text-center font-moul leading-relaxed">
                                <div className="font-battambang font-bold text-slate-700 text-xs mb-1">ធ្វើនៅ................ថ្ងៃទី......ខែ......ឆ្នាំ......</div>
                                <div>គ្រូបន្ទុកថ្នាក់</div>
                                <div className="text-xs font-battambang mt-1 text-slate-500">ហត្ថលេខា និងឈ្មោះ</div>
                                <div className="h-20"></div>
                                <div className="text-blue-800">{settings.teacher_name || "ឈ្មោះគ្រូ"}</div>
                            </div>
                        </div>

                    </div>
                )})}
            </div>

        </div>
    )
}
