'use client'

import { useMemo } from 'react'
import { ArrowLeft, Printer, Users } from 'lucide-react'
import Link from 'next/link'
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'

export default function PrintStudentAgeClient({ initialStudents, settings, academicYear }: { 
    initialStudents: any[], settings: any, academicYear: string 
}) {
    const MIN_AGE = 5
    const MAX_AGE = 20

    const calculateAge = (dob: string | null) => {
        if (!dob || dob === '-') return null
        const birthDate = new Date(dob)
        if (isNaN(birthDate.getTime())) return null
        const today = new Date()
        let age = today.getFullYear() - birthDate.getFullYear()
        const m = today.getMonth() - birthDate.getMonth()
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
        return age
    }

    const { ageStats, totalF, totalM, allTotal, ageDataForCharts } = useMemo(() => {
        const stats = { female: {} as Record<number, number>, male: {} as Record<number, number> }
        for (let i = MIN_AGE; i <= MAX_AGE; i++) {
            stats.female[i] = 0
            stats.male[i] = 0
        }

        let totalF = 0
        let totalM = 0
        
        initialStudents.forEach(s => {
            const isFemale = s.gender === 'ស្រី' || s.gender === 'F'
            if (isFemale) totalF++
            else totalM++

            const age = calculateAge(s.dob)
            if (age !== null && age >= MIN_AGE && age <= MAX_AGE) {
                if (isFemale) stats.female[age]++
                else stats.male[age]++
            }
        })

        const ageDataForCharts = []
        for (let i = MIN_AGE; i <= MAX_AGE; i++) {
            if (stats.female[i] > 0 || stats.male[i] > 0) {
                ageDataForCharts.push({
                    ageStr: `អាយុ ${i}`,
                    male: stats.male[i],
                    female: stats.female[i],
                    total: stats.male[i] + stats.female[i]
                })
            }
        }

        return { ageStats: stats, totalF, totalM, allTotal: initialStudents.length, ageDataForCharts }
    }, [initialStudents])

    const printPage = () => {
        window.print()
    }

    const khmerColors = ['#059669', '#2563eb', '#db2777', '#d97706', '#7c3aed', '#14b8a6', '#f43f5e', '#8b5cf6', '#ea580c', '#0ea5e9']

    return (
        <div className="min-h-screen bg-[#f0f4f8] text-slate-800 font-battambang print:bg-white print:m-0 print:p-0">
            <style jsx global>{`
                @media print {
                    @page { size: A4 landscape; margin: 10mm; }
                    body { background: white !important; margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
                    .no-print { display: none !important; }
                    .print-container { 
                        display: block !important; 
                        width: 100%;
                        height: 100%;
                        box-shadow: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        page-break-after: always;
                    }
                }
                .report-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 15px; }
                .report-table th, .report-table td { border: 1px solid #cbd5e1; padding: 8px 4px; text-align: center; vertical-align: middle; }
                .report-table th { background-color: #f1f5f9; font-family: 'Moul', cursive; font-weight: normal; font-size: 12px; }
            `}</style>

            <div className="no-print max-w-7xl mx-auto px-4 mt-8 pb-10">
                <div className="flex justify-between items-center mb-6">
                    <Link href="/dashboard" className="inline-flex items-center gap-2 text-[#0054a6] hover:text-blue-800 font-bold transition bg-white/50 px-4 py-2 rounded-xl backdrop-blur-sm shadow-sm w-fit">
                        <ArrowLeft className="w-5 h-5" /> ត្រឡប់ទៅទំព័រដើម
                    </Link>
                    <button onClick={printPage} className="bg-[#0054a6] hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold transition shadow-md flex items-center gap-2 text-sm">
                        <Printer className="w-4 h-4" /> បោះពុម្ពទិន្នន័យ
                    </button>
                </div>

                <div className="bg-white/95 backdrop-blur border border-white/50 rounded-2xl p-6 md:p-8 shadow-lg mb-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-blue-100 rounded-full text-[#0054a6]">
                            <Users className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="font-moul text-xl md:text-2xl text-[#0054a6]">បញ្ជីរាប់ និងវិភាគអាយុ-កម្ពស់សិស្ស</h1>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-center justify-between">
                            <div><p className="text-sm text-gray-500 font-bold mb-1">សិស្សសរុប</p><h3 className="text-2xl font-bold text-blue-700">{allTotal}</h3></div>
                        </div>
                        <div className="bg-pink-50 border border-pink-100 p-4 rounded-xl flex items-center justify-between">
                            <div><p className="text-sm text-gray-500 font-bold mb-1">សិស្សស្រី</p><h3 className="text-2xl font-bold text-pink-600">{totalF}</h3></div>
                        </div>
                        <div className="bg-sky-50 border border-sky-100 p-4 rounded-xl flex items-center justify-between">
                            <div><p className="text-sm text-gray-500 font-bold mb-1">សិស្សប្រុស</p><h3 className="text-2xl font-bold text-sky-600">{totalM}</h3></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
                            <h3 className="font-bold text-slate-700 mb-4 self-start flex items-center gap-2">របាយចំនួនសិស្សតាមអាយុសរុប</h3>
                            <div className="w-full h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={ageDataForCharts} dataKey="total" nameKey="ageStr" cx="50%" cy="50%" outerRadius={100} label>
                                            {ageDataForCharts.map((entry, index) => <Cell key={`cell-${index}`} fill={khmerColors[index % khmerColors.length]} />)}
                                        </Pie>
                                        <RechartsTooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
                            <h3 className="font-bold text-slate-700 mb-4 self-start flex items-center gap-2">ប្រៀបធៀបចំនួនសិស្សប្រុស និងស្រី</h3>
                            <div className="w-full h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={ageDataForCharts}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="ageStr" />
                                        <YAxis />
                                        <RechartsTooltip />
                                        <Legend />
                                        <Bar dataKey="male" name="ប្រុស" fill="#3b82f6" radius={[4,4,0,0]} />
                                        <Bar dataKey="female" name="ស្រី" fill="#ec4899" radius={[4,4,0,0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hidden Print Container */}
            <div className="hidden print:block print-container bg-white w-[297mm] min-h-[210mm] mx-auto p-[10mm_15mm] relative">
                <div className="flex justify-between items-start mb-6">
                    <div className="text-[10pt] leading-relaxed font-moul" style={{ marginTop: '40pt' }}>
                        <p>{settings.management_unit_1 || "មន្ទីរអប់រំ យុវជន និងកីឡា..."}</p>
                        <p>{settings.management_unit_2 || "ការិយាល័យអប់រំ យុវជន និងកីឡា..."}</p>
                        <p>{settings.school_name || "សាលាបឋមសិក្សា..."}</p>
                        <p>ឆ្នាំសិក្សា {academicYear}</p>
                    </div>
                    <div className="text-center">
                        <h3 className="font-moul text-[12pt] mb-1">ព្រះរាជាណាចក្រកម្ពុជា</h3>
                        <h3 className="font-moul text-[12pt] mb-1">ជាតិ សាសនា ព្រះមហាក្សត្រ</h3>
                    </div>
                </div>

                <h2 className="font-moul text-center text-[14pt] mt-4 mb-6 uppercase">បញ្ជីរាប់អាយុ និងភេទសិស្ស</h2>
                
                <div className="flex justify-between items-end mb-2 font-bold text-[11pt]">
                    <p>ចំនួនសិស្សសរុប {allTotal} នាក់ ស្រី {totalF} នាក់</p>
                    <p>ថ្នាក់ទី៖ {settings.class_name || "១២ ក"}</p>
                </div>

                <table className="report-table">
                    <thead>
                        <tr>
                            <th rowSpan={2} className="w-16">ភេទ</th>
                            <th colSpan={MAX_AGE - MIN_AGE + 1}>អាយុ</th>
                            <th rowSpan={2} className="w-16">សរុប</th>
                        </tr>
                        <tr>
                            {Array.from({length: MAX_AGE - MIN_AGE + 1}, (_, i) => i + MIN_AGE).map(age => (
                                <th key={age}>{age}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="font-moul text-pink-700 bg-slate-50">ស្រី</td>
                            {Array.from({length: MAX_AGE - MIN_AGE + 1}, (_, i) => i + MIN_AGE).map(age => (
                                <td key={age}>{ageStats.female[age] || ''}</td>
                            ))}
                            <td className="font-bold text-pink-700">{totalF}</td>
                        </tr>
                        <tr>
                            <td className="font-moul text-sky-700 bg-slate-50">ប្រុស</td>
                            {Array.from({length: MAX_AGE - MIN_AGE + 1}, (_, i) => i + MIN_AGE).map(age => (
                                <td key={age}>{ageStats.male[age] || ''}</td>
                            ))}
                            <td className="font-bold text-sky-700">{totalM}</td>
                        </tr>
                        <tr>
                            <td className="font-moul text-blue-800 bg-slate-50">សរុប</td>
                            {Array.from({length: MAX_AGE - MIN_AGE + 1}, (_, i) => i + MIN_AGE).map(age => (
                                <td key={age} className="font-bold">{(ageStats.female[age] + ageStats.male[age]) || ''}</td>
                            ))}
                            <td className="font-bold text-blue-800">{allTotal}</td>
                        </tr>
                    </tbody>
                </table>

                <div className="grid grid-cols-2 gap-8 mt-16 px-10">
                    <div className="text-center font-moul leading-relaxed">
                        <div className="text-[11pt] font-bold mb-2">បានឃើញ និងឯកភាព</div>
                        <div className="text-[12pt] uppercase">{settings.manager_role || "នាយកសាលា"}</div>
                        <div className="h-24"></div>
                        <div className="text-[11.5pt]">{settings.manager_name || ""}</div>
                    </div>
                    <div className="text-center font-moul leading-relaxed">
                        <div className="text-[11pt] mb-2 font-battambang font-bold">ថ្ងៃទី...........ខែ...........ឆ្នាំ...........</div>
                        <div className="text-[12pt]">គ្រូបន្ទុកថ្នាក់</div>
                        <div className="h-24"></div>
                        <div className="text-[11.5pt] text-blue-800">{settings.homeroom_teacher || "ឈ្មោះគ្រូ"}</div>
                    </div>
                </div>

            </div>
        </div>
    )
}
