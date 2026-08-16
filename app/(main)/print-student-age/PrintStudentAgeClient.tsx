'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/actions/Button'
import { ArrowLeft, Printer, Users, Ruler } from 'lucide-react'
import Link from 'next/link'
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line, ScatterChart, Scatter } from 'recharts'
import type { Settings, Student } from '@/lib/types'
import { calculateAge } from '@/lib/utils/date'

/** Mean of a list, or null when there is nothing to average. */
function mean(values: number[]): number | null {
    if (values.length === 0) return null
    return values.reduce((a, b) => a + b, 0) / values.length
}

/** One decimal place, or an em dash when the figure does not exist yet. */
function fmt(value: number | null, unit: string): string {
    return value === null ? '—' : `${value.toFixed(1)} ${unit}`
}

export default function PrintStudentAgeClient({ initialStudents, settings, academicYear, heights }: {
    initialStudents: Student[], settings: Settings | null, academicYear: string,
    /** `studentId` → latest height in cm, from the health tracking book. */
    heights: Record<string, number>
}) {
    const MIN_AGE = 5
    const MAX_AGE = 20

    const {
        ageStats, totalF, totalM, allTotal, ageDataForCharts,
        metrics, scatterMale, scatterFemale, hasHeightData,
    } = useMemo(() => {
        const stats = { female: {} as Record<number, number>, male: {} as Record<number, number> }
        for (let i = MIN_AGE; i <= MAX_AGE; i++) {
            stats.female[i] = 0
            stats.male[i] = 0
        }

        let totalF = 0
        let totalM = 0

        // Collected as raw lists rather than running sums so the averages and the
        // maxima come from exactly the same population.
        const ageAll: number[] = [], ageM: number[] = [], ageF: number[] = []
        const hAll: number[] = [], hM: number[] = [], hF: number[] = []
        const scatterMale: { age: number; height: number; name: string }[] = []
        const scatterFemale: { age: number; height: number; name: string }[] = []

        initialStudents.forEach(s => {
            const isFemale = s.gender === 'ស្រី' || s.gender === 'F'
            if (isFemale) totalF++
            else totalM++

            const age = calculateAge(s.dob)
            const height = heights[s.id]

            if (age !== null && age >= MIN_AGE && age <= MAX_AGE) {
                if (isFemale) stats.female[age]++
                else stats.male[age]++

                ageAll.push(age)
                if (isFemale) ageF.push(age); else ageM.push(age)
            }

            if (typeof height === 'number') {
                hAll.push(height)
                if (isFemale) hF.push(height); else hM.push(height)

                // The scatter plots height against age, so a pupil missing either
                // one cannot be placed and is left off rather than drawn at zero.
                if (age !== null) {
                    const point = { age, height, name: s.name_kh || s.full_name || '' }
                    if (isFemale) scatterFemale.push(point); else scatterMale.push(point)
                }
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

        const metrics = {
            avgAgeAll: mean(ageAll), avgAgeM: mean(ageM), avgAgeF: mean(ageF),
            maxAge: ageAll.length ? Math.max(...ageAll) : null,
            avgHAll: mean(hAll), avgHM: mean(hM), avgHF: mean(hF),
            maxHeight: hAll.length ? Math.max(...hAll) : null,
        }

        return {
            ageStats: stats, totalF, totalM, allTotal: initialStudents.length, ageDataForCharts,
            metrics, scatterMale, scatterFemale, hasHeightData: hAll.length > 0,
        }
    }, [initialStudents, heights])

    const printPage = () => {
        window.print()
    }

    const khmerColors = ['#059669', '#2563eb', '#db2777', '#d97706', '#7c3aed', '#14b8a6', '#f43f5e', '#8b5cf6', '#ea580c', '#0ea5e9']

    return (
        <div className="min-h-screen bg-paper text-text-heading font-battambang print:bg-bg-surface print:m-0 print:p-0">
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
                    <Link href="/dashboard" className="inline-flex items-center gap-2 text-brand hover:text-brand-800 font-bold transition bg-bg-surface/50 px-4 py-2 rounded-xl backdrop-blur-sm shadow-sm w-fit">
                        <ArrowLeft className="w-5 h-5" /> ត្រឡប់ទៅទំព័រដើម
                    </Link>
                    <Button printHidden={false} onClick={printPage}>
                        <Printer className="w-4 h-4" /> បោះពុម្ពទិន្នន័យ
                    </Button>
                </div>

                <div className="bg-bg-surface/95 backdrop-blur border border-white/50 rounded-xl p-6 md:p-8 shadow-lg mb-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-brand-100 rounded-full text-brand">
                            <Users className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="kh-moul text-xl md:text-2xl text-brand">បញ្ជីរាប់ និងវិភាគអាយុ-កម្ពស់សិស្ស</h1>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-brand-100 border border-divider p-4 rounded-xl flex items-center justify-between">
                            <div><p className="text-sm text-text-muted font-bold mb-1">សិស្សសរុប</p><h3 className="text-2xl font-bold text-brand">{allTotal}</h3></div>
                        </div>
                        <div className="bg-brand-100 border border-divider p-4 rounded-xl flex items-center justify-between">
                            <div><p className="text-sm text-text-muted font-bold mb-1">សិស្សស្រី</p><h3 className="text-2xl font-bold text-brand">{totalF}</h3></div>
                        </div>
                        <div className="bg-brand-100 border border-divider p-4 rounded-xl flex items-center justify-between">
                            <div><p className="text-sm text-text-muted font-bold mb-1">សិស្សប្រុស</p><h3 className="text-2xl font-bold text-brand-500">{totalM}</h3></div>
                        </div>
                    </div>

                    {/* Age and height metrics, carried over from the legacy analysis page. */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="bg-paper border border-divider p-4 rounded-xl">
                            <p className="text-xs text-text-muted font-bold mb-1">អាយុមធ្យម (សរុប)</p>
                            <h3 className="text-xl font-bold text-text-heading">{fmt(metrics.avgAgeAll, 'ឆ្នាំ')}</h3>
                            <p className="mt-1 text-[11px] text-text-muted">
                                ប្រុស {fmt(metrics.avgAgeM, '')} · ស្រី {fmt(metrics.avgAgeF, '')}
                            </p>
                        </div>
                        <div className="bg-paper border border-divider p-4 rounded-xl">
                            <p className="text-xs text-text-muted font-bold mb-1">អាយុច្រើនបំផុត</p>
                            <h3 className="text-xl font-bold text-text-heading">
                                {metrics.maxAge === null ? '—' : `${metrics.maxAge} ឆ្នាំ`}
                            </h3>
                        </div>
                        <div className="bg-paper border border-divider p-4 rounded-xl">
                            <p className="text-xs text-text-muted font-bold mb-1">កម្ពស់មធ្យម (សរុប)</p>
                            <h3 className="text-xl font-bold text-text-heading">{fmt(metrics.avgHAll, 'សម')}</h3>
                            <p className="mt-1 text-[11px] text-text-muted">
                                ប្រុស {fmt(metrics.avgHM, '')} · ស្រី {fmt(metrics.avgHF, '')}
                            </p>
                        </div>
                        <div className="bg-paper border border-divider p-4 rounded-xl">
                            <p className="text-xs text-text-muted font-bold mb-1">កម្ពស់ខ្ពស់បំផុត</p>
                            <h3 className="text-xl font-bold text-text-heading">{fmt(metrics.maxHeight, 'សម')}</h3>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <div className="bg-bg-surface p-5 rounded-xl border border-divider shadow-sm flex flex-col items-center">
                            <h3 className="font-bold text-text-body mb-4 self-start flex items-center gap-2">របាយចំនួនសិស្សតាមអាយុសរុប</h3>
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

                        <div className="bg-bg-surface p-5 rounded-xl border border-divider shadow-sm flex flex-col items-center">
                            <h3 className="font-bold text-text-body mb-4 self-start flex items-center gap-2">ប្រៀបធៀបចំនួនសិស្សប្រុស និងស្រី</h3>
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

                        <div className="bg-bg-surface p-5 rounded-xl border border-divider shadow-sm flex flex-col items-center">
                            <h3 className="font-bold text-text-body mb-4 self-start flex items-center gap-2">និន្នាការចំនួនសិស្សតាមអាយុ</h3>
                            <div className="w-full h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={ageDataForCharts}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="ageStr" />
                                        <YAxis allowDecimals={false} />
                                        <RechartsTooltip />
                                        <Legend />
                                        <Line type="monotone" dataKey="total" name="សរុប" stroke="#0054a6" strokeWidth={2} dot={{ r: 3 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-bg-surface p-5 rounded-xl border border-divider shadow-sm flex flex-col items-center">
                            <h3 className="font-bold text-text-body mb-4 self-start flex items-center gap-2">ទំនាក់ទំនងរវាងអាយុ និងកម្ពស់</h3>
                            <div className="w-full h-[300px]">
                                {hasHeightData ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            {/*
                                              `domain={['dataMin - n', 'dataMax + n']}` rather than the
                                              default: a class spanning two years of age would otherwise
                                              plot every point on the axis edges.
                                            */}
                                            <XAxis type="number" dataKey="age" name="អាយុ" unit=" ឆ្នាំ" domain={['dataMin - 1', 'dataMax + 1']} allowDecimals={false} />
                                            <YAxis type="number" dataKey="height" name="កម្ពស់" unit=" សម" domain={['dataMin - 5', 'dataMax + 5']} />
                                            <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} />
                                            <Legend />
                                            <Scatter name="ប្រុស" data={scatterMale} fill="#3b82f6" />
                                            <Scatter name="ស្រី" data={scatterFemale} fill="#ec4899" />
                                        </ScatterChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-text-muted">
                                        <Ruler className="h-8 w-8 text-text-muted/60" aria-hidden="true" />
                                        <p>មិនទាន់មានទិន្នន័យកម្ពស់នៅឡើយ។</p>
                                        <Link href="/class-admin/health_tracking" className="font-bold text-brand hover:underline">
                                            បញ្ចូលទម្ងន់ និងកម្ពស់សិស្ស
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hidden Print Container */}
            <div className="hidden print:block print-container bg-white w-[297mm] min-h-[210mm] mx-auto p-[10mm_15mm] relative">
                <div className="flex justify-between items-start mb-6">
                    <div className="text-[10pt] leading-relaxed kh-moul" style={{ marginTop: '40pt' }}>
                        <p>{settings?.management_unit_1 || "មន្ទីរអប់រំ យុវជន និងកីឡា..."}</p>
                        <p>{settings?.management_unit_2 || "ការិយាល័យអប់រំ យុវជន និងកីឡា..."}</p>
                        <p>{settings?.school_name || "សាលាបឋមសិក្សា..."}</p>
                        <p>ឆ្នាំសិក្សា {academicYear}</p>
                    </div>
                    <div className="text-center">
                        <h3 className="kh-moul text-[12pt] mb-1">ព្រះរាជាណាចក្រកម្ពុជា</h3>
                        <h3 className="kh-moul text-[12pt] mb-1">ជាតិ សាសនា ព្រះមហាក្សត្រ</h3>
                    </div>
                </div>

                <h2 className="kh-moul text-center text-[14pt] mt-4 mb-6 uppercase">បញ្ជីរាប់អាយុ និងភេទសិស្ស</h2>
                
                <div className="flex justify-between items-end mb-2 font-bold text-[11pt]">
                    <p>ចំនួនសិស្សសរុប {allTotal} នាក់ ស្រី {totalF} នាក់</p>
                    <p>ថ្នាក់ទី៖ {settings?.class_name || "១២ ក"}</p>
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
                            <td className="kh-moul text-pink-700 bg-slate-50">ស្រី</td>
                            {Array.from({length: MAX_AGE - MIN_AGE + 1}, (_, i) => i + MIN_AGE).map(age => (
                                <td key={age}>{ageStats.female[age] || ''}</td>
                            ))}
                            <td className="font-bold text-pink-700">{totalF}</td>
                        </tr>
                        <tr>
                            <td className="kh-moul text-sky-700 bg-slate-50">ប្រុស</td>
                            {Array.from({length: MAX_AGE - MIN_AGE + 1}, (_, i) => i + MIN_AGE).map(age => (
                                <td key={age}>{ageStats.male[age] || ''}</td>
                            ))}
                            <td className="font-bold text-sky-700">{totalM}</td>
                        </tr>
                        <tr>
                            <td className="kh-moul text-blue-800 bg-slate-50">សរុប</td>
                            {Array.from({length: MAX_AGE - MIN_AGE + 1}, (_, i) => i + MIN_AGE).map(age => (
                                <td key={age} className="font-bold">{(ageStats.female[age] + ageStats.male[age]) || ''}</td>
                            ))}
                            <td className="font-bold text-blue-800">{allTotal}</td>
                        </tr>
                    </tbody>
                </table>

                <div className="grid grid-cols-2 gap-8 mt-16 px-10">
                    <div className="text-center kh-moul leading-relaxed">
                        <div className="text-[11pt] font-bold mb-2">បានឃើញ និងឯកភាព</div>
                        <div className="text-[12pt] uppercase">{settings?.manager_role || "នាយកសាលា"}</div>
                        <div className="h-24"></div>
                        <div className="text-[11.5pt]">{settings?.manager_name || ""}</div>
                    </div>
                    <div className="text-center kh-moul leading-relaxed">
                        <div className="text-[11pt] mb-2 font-battambang font-bold">ថ្ងៃទី...........ខែ...........ឆ្នាំ...........</div>
                        <div className="text-[12pt]">គ្រូបន្ទុកថ្នាក់</div>
                        <div className="h-24"></div>
                        <div className="text-[11.5pt] text-blue-800">{settings?.homeroom_teacher || "ឈ្មោះគ្រូ"}</div>
                    </div>
                </div>

            </div>
        </div>
    )
}
