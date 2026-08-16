'use client'

import { ArrowLeft, Key, Printer, Info, Copy, Users } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import Link from 'next/link'
import type { Student } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { notify } from '@/components/ui/feedback/notify'

export default function PrintStudentCodesClient({ initialStudents, teacherUid }: { initialStudents: Student[], teacherUid: string }) {

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            notify.success(`បានចម្លងអត្តលេខសិស្ស៖ ${text}`)
        }).catch(err => {
            logger.error('Failed to copy text: ', err)
            notify.error('បរាជ័យក្នុងការចម្លង សូមចម្លងលេខកូដដោយផ្ទាល់')
        })
    }

    const printPage = () => {
        window.print()
    }

    return (
        <div className="min-h-screen bg-paper text-text-heading font-battambang flex flex-col print:bg-bg-surface print:m-0 print:p-0">
            <style jsx global>{`
                .print-codes-mode {
                    position: absolute;
                    left: -9999px;
                    top: 0;
                    opacity: 0;
                    pointer-events: none;
                    z-index: -1;
                }
                
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; margin: 0; padding: 0; }
                    .print-codes-mode {
                        position: relative !important;
                        left: 0 !important;
                        opacity: 1 !important;
                        display: grid !important;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 15px;
                        padding: 10px;
                        width: 100%;
                    }
                    .student-code-card {
                        border: 2px dashed #1D3E73;
                        border-radius: 12px;
                        padding: 15px;
                        break-inside: avoid;
                        page-break-inside: avoid;
                    }
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    @page { margin: 10mm; }
                }
            `}</style>

            <div className="no-print sticky top-0 z-50 px-4 md:px-8 py-3 bg-bg-surface/90 backdrop-blur-lg border-b border-divider shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard" className="text-text-muted hover:text-brand-hover hover:bg-brand-100 p-2 rounded-xl transition flex items-center gap-2 font-bold">
                        <ArrowLeft className="w-5 h-5" /> <span className="hidden sm:inline">ត្រឡប់ក្រោយ</span>
                    </Link>
                    <div className="h-6 w-px bg-divider"></div>
                    <h1 className="kh-moul text-lg sm:text-xl text-brand flex items-center gap-2">
                        <Key className="w-6 h-6 text-brand" /> លេខកូដសិស្ស និង QR Code
                    </h1>
                </div>
                
                <Button printHidden={false} onClick={printPage}>
                    <Printer className="w-4 h-4" /> <span className="hidden sm:inline">បោះពុម្ពកាត</span>
                </Button>
            </div>

            <div className="no-print max-w-5xl mx-auto w-full p-4 sm:p-6 flex-1 flex flex-col">
                <div className="p-4 bg-warning/10 text-sm text-warning border border-warning/30 rounded-xl mb-6 flex gap-3 items-start shadow-sm">
                    <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-warning" />
                    <p>សូមចែករំលែក <b>&quot;លេខកូដថ្នាក់&quot;</b> និង <b>&quot;អត្តលេខសិស្ស&quot;</b> ឫឱ្យមាតាបិតាស្កេន <b>&quot;QR Code&quot;</b> ដើម្បីឱ្យពួកគាត់អាចចូលប្រើប្រាស់ Parent Portal បាន។ អ្នកអាចចុចបោះពុម្ពខាងលើ ដើម្បីកាត់កាតចែកសិស្សយកទៅជូនឪពុកម្តាយ។</p>
                </div>

                <div className="bg-bg-surface rounded-xl shadow-sm border border-divider flex-1 p-4 sm:p-6">
                    {initialStudents.length === 0 ? (
                        <div className="text-center py-20 text-text-muted font-bold">
                            <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />មិនទាន់មានទិន្នន័យសិស្សនៅក្នុងប្រព័ន្ធទេ!
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {initialStudents.map(s => {
                                const loginUrl = `https://portal.krusmart.org/?tid=${teacherUid}&sid=${s.id}`
                                const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=1D3E73&data=${encodeURIComponent(loginUrl)}`

                                return (
                                    <div key={s.id} className="border border-divider rounded-xl p-4 bg-paper flex justify-between items-center shadow-sm hover:border-brand hover:shadow-md transition duration-300">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full border-2 border-white shadow-sm flex items-center justify-center font-bold bg-brand-100 text-brand shrink-0">
                                                {s.gender === 'ស្រី' || s.gender === 'F' ? 'ស' : 'ប'}
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="font-bold text-text-heading text-base truncate">{s.name_kh || s.full_name || 'គ្មានឈ្មោះ'}</p>
                                                <p className="text-sm text-text-muted">អត្តលេខ: <span className="font-mono font-bold text-brand">{s.id}</span></p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture */}
                                            <img src={qrCodeUrl} alt="QR" className="w-12 h-12 border border-divider rounded-lg shadow-sm" title="QR Code សម្រាប់ស្កេនចូល" />
                                            <Button printHidden={false} onClick={() => copyToClipboard(s.id)} title="ចម្លងអត្តលេខសិស្ស">
                                                <Copy className="w-5 h-5" />
                                            </Button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="print-codes-mode">
                {initialStudents.map(s => {
                    const loginUrl = `https://portal.krusmart.org/?tid=${teacherUid}&sid=${s.id}`
                    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=1D3E73&data=${encodeURIComponent(loginUrl)}`

                    return (
                        <div key={s.id} className="student-code-card">
                            <h3 className="kh-moul" style={{ margin: '0 0 10px 0', color: '#1D3E73', fontSize: '14px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
                                កាតគណនីអាណាព្យាបាល
                            </h3>
                            <p style={{ margin: '6px 0', fontSize: '13px', color: '#374151' }}>សិស្ស៖ <strong style={{ color: '#1f2937', fontSize: '14px' }}>{s.name_kh || s.full_name || 'គ្មានឈ្មោះ'}</strong></p>
                            
                            <table style={{ width: '100%', background: '#f8fafc', padding: '10px', borderRadius: '8px', marginTop: '10px', borderCollapse: 'collapse', border: 'none' }}>
                                <tbody>
                                    <tr>
                                        <td style={{ verticalAlign: 'middle', padding: '8px' }}>
                                            <p style={{ margin: '0 0 6px 0', fontSize: '12px', color: '#475569' }}>១. លេខកូដថ្នាក់ (Teacher UID)៖<br />
                                                <strong style={{ fontFamily: 'monospace', fontSize: '13px', color: '#1D3E73' }}>{teacherUid}</strong>
                                            </p>
                                            <p style={{ margin: 0, fontSize: '12px', color: '#475569' }}>២. អត្តលេខសិស្ស (Student ID)៖<br />
                                                <strong style={{ fontFamily: 'monospace', fontSize: '14px', color: '#1D3E73' }}>{s.id}</strong>
                                            </p>
                                        </td>
                                        <td style={{ width: '80px', textAlign: 'center', verticalAlign: 'middle', borderLeft: '1px dashed #cbd5e1', paddingLeft: '10px', paddingTop: '8px', paddingBottom: '8px' }}>
                                            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture */}
                                            <img src={qrCodeUrl} alt="QR Code" style={{ width: '65px', height: '65px', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'inline-block' }} />
                                            <p style={{ fontSize: '9px', color: '#64748b', marginTop: '4px', fontWeight: 'bold', marginBottom: 0 }}>ស្កេនដើម្បីចូល</p>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            
                            <p style={{ margin: '12px 0 0 0', fontSize: '10px', color: '#64748b', textAlign: 'center' }}>*សូមស្កេន QR Code ឬប្រើលេខកូដទាំង២ ដើម្បីចូលប្រព័ន្ធ</p>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
