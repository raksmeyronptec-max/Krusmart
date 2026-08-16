'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/actions/Button'
import { ArrowLeft, Image as ImageIcon, PenTool, ZoomIn, ZoomOut, Printer, Inbox } from 'lucide-react'
import Link from 'next/link'
import Select from '@/components/ui/forms/Select'
import type { Settings, Student } from '@/lib/types'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { formatKhmerDate } from '@/lib/utils/date'
import { notify } from '@/components/ui/feedback/notify'

/**
 * The student's place of birth, with the administrative-unit prefix stripped
 * from each part ("ភូមិ", "ឃុំ/សង្កាត់", …) so the card stays inside its line.
 *
 * This previously took `any` and read `village_name` / `village` / `commune_name`
 * and friends — Firebase-era column names that no longer exist on a `students`
 * row, so it returned `'-'` for every card. It reads the real `birth_*` columns
 * now.
 */
function formatLocationShort(s: Student): string {
    const clean = (str: string | null | undefined, regex: RegExp) => str ? str.replace(regex, '').trim() : ''
    const v = clean(s.birth_village, /^(ភូមិទី|ភូមិ)\s*/)
    const c = clean(s.birth_commune, /^(ឃុំ\/សង្កាត់|សង្កាត់|ឃុំ)\s*/)
    const d = clean(s.birth_district, /^(ស្រុក\/ខណ្ឌ|ក្រុង\/ស្រុក\/ខណ្ឌ|ខណ្ឌ|ស្រុក|ក្រុង)\s*/)
    const p = clean(s.birth_province, /^(ខេត្ត\/ក្រុង|រាជធានី\/ខេត្ត|រាជធានី|ខេត្ត)\s*/)

    return [v, c, d, p].filter(Boolean).join(' ') || '-'
}

const getDriveImageUrl = (url: string) => {
    if (!url) return url;
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('drive.google.com')) {
            let fileId = null;
            if (urlObj.pathname.includes('/file/d/')) {
                fileId = urlObj.pathname.split('/file/d/')[1].split('/')[0];
            } else if (urlObj.searchParams.has('id')) {
                fileId = urlObj.searchParams.get('id');
            }
            if (fileId) {
                return `https://lh3.googleusercontent.com/d/${fileId}`;
            }
        }
    } catch {
        return url;
    }
    return url;
}

export default function IdStudentClient({ initialStudents, settings }: { initialStudents: Student[], settings: Settings | null }) {
    const [currentBgImage, setCurrentBgImage] = useState('/id-templates/2_id-student.jpg')
    const [signatureImageSrc, setSignatureImageSrc] = useState('')
    const [signatureScale, setSignatureScale] = useState(1)

    const handleBgChange = (val: string) => {
        setCurrentBgImage(`/id-templates/${val}`)
        if (val === '3_id_student.png' && !settings?.school_logo) {
            notify.error('មិនទាន់មានរូបសញ្ញាសាលា — សូមបញ្ចូលវានៅទំព័រព័ត៌មានគណនីជាមុនសិន')
        }
    }

    const uploadSignature = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = function(evt) {
                setSignatureImageSrc(evt.target?.result as string)
            }
            reader.readAsDataURL(file)
        }
    }

    const zoomSignature = (delta: number) => {
        setSignatureScale(prev => {
            let next = prev + delta
            if (next < 0.2) next = 0.2
            if (next > 5.0) next = 5.0
            return next
        })
    }

    const managementUnit1 = settings?.management_unit_1 || ''
    const schoolName = settings?.school_name || ''
    const academicYear = toKhmerNumber(settings?.academic_year || '២០២៤-២០២៥')
    const className = settings?.class_name || '១ «ក»'
    const director = settings?.director_name || 'នាយកសាលា'
    const provinceDate = settings?.province_date || 'ភ្នំពេញ'
    const schoolLogoUrl = settings?.school_logo || ''

    return (
        <div className="bg-[var(--surface-muted)] min-h-screen text-[var(--text-heading)] font-battambang print:bg-bg-surface print:m-0 print:p-0">
            <style jsx global>{`
                .font-battambang { font-family: 'Battambang', cursive; }
                
                .student-card {
                    width: 100mm;
                    height: 140mm;
                    position: relative;
                    background-color: white;
                    box-sizing: border-box;
                    overflow: hidden;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.1);
                    margin: 0 auto;
                }

                @media print {
                    @page { 
                        size: A4 portrait; 
                        margin: 4mm;
                    }
                    
                    body { 
                        background-color: white !important; 
                        margin: 0 !important; 
                        padding: 0 !important; 
                        -webkit-print-color-adjust: exact !important; 
                        print-color-adjust: exact !important;
                    }
                    
                    .no-print { display: none !important; }
                    
                    .container {
                        max-width: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    #cards-container {
                        display: grid !important;
                        grid-template-columns: 100mm 100mm !important;
                        gap: 2mm !important;
                        padding: 0 !important;
                        justify-content: center !important;
                        align-content: start !important;
                    }

                    .student-card {
                        width: 100mm !important;
                        height: 140mm !important;
                        box-shadow: none !important;
                        border: 1px dashed #9ca3af !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                        margin: 0 !important;
                    }

                    .student-card:nth-child(4n) {
                        page-break-after: always !important;
                        break-after: page !important;
                    }
                }
            `}</style>

            <nav className="bg-brand-900 text-white p-4 shadow-lg sticky top-0 z-50 no-print">
                <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <Link href="/dashboard" className="hover:text-brand-300 transition-colors p-2 -ml-2 rounded-full hover:bg-bg-surface/10">
                            <ArrowLeft className="w-6 h-6" />
                        </Link>
                        <h1 className="kh-moul text-lg">បោះពុម្ពកាតសិស្ស</h1>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto text-sm">
                        <div className="bg-bg-surface/10 flex items-center rounded overflow-hidden shadow-inner px-3 py-2 gap-2">
                            <ImageIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">ផ្ទៃខាងក្រោយ:</span>
                            <Select
                                variant="ghost"
                                ariaLabel="ផ្ទៃខាងក្រោយ"
                                defaultValue="2_id-student.jpg"
                                onChange={handleBgChange}
                                options={[
                                    { value: '1_id-student.jpg', label: 'ទម្រង់ទី ១' },
                                    { value: '2_id-student.jpg', label: 'ទម្រង់ទី ២' },
                                    { value: '3_id_student.png', label: 'ទម្រង់ទី ៣ (Logo)' },
                                ]}
                                className="text-white [&>option]:text-text-heading"
                            />
                        </div>

                        <div className="bg-bg-surface/10 flex items-center rounded overflow-hidden shadow-inner">
                            <label className="cursor-pointer hover:bg-bg-surface/20 px-3 py-2 flex items-center gap-2 transition-colors border-r border-white/20">
                                <PenTool className="w-4 h-4" /> <span className="hidden sm:inline">ហត្ថលេខា</span>
                                <input type="file" accept="image/*" className="hidden" onChange={uploadSignature} />
                            </label>
                            <button onClick={() => zoomSignature(0.1)} className="hover:bg-bg-surface/20 px-3 py-2 transition-colors flex items-center" title="ពង្រីក (Zoom In)">
                                <ZoomIn className="w-4 h-4" />
                            </button>
                            <button onClick={() => zoomSignature(-0.1)} className="hover:bg-bg-surface/20 px-3 py-2 transition-colors flex items-center" title="បង្រួម (Zoom Out)">
                                <ZoomOut className="w-4 h-4" />
                            </button>
                        </div>

                        <Button printHidden={false} onClick={() => window.print()}>
                            <Printer className="w-4 h-4" /> បោះពុម្ព
                        </Button>
                    </div>
                </div>
            </nav>

            <div className="container mx-auto max-w-5xl my-8 print:my-0 print:max-w-none">
                {initialStudents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-text-muted bg-bg-surface rounded-xl shadow-sm no-print">
                        <Inbox className="w-16 h-16 mb-4 opacity-50" />
                        <p className="text-lg font-bold">មិនមានទិន្នន័យសិស្សសម្រាប់បោះពុម្ពទេ</p>
                    </div>
                ) : (
                    <div id="cards-container" className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-6 justify-items-center print:gap-0 print:p-0">
                        {initialStudents.map(student => {
                            const dob = formatKhmerDate(student.dob)
                            const pob = formatLocationShort(student)
                            const father = student.father_name || '-'
                            const mother = student.mother_name || '-'
                            const phone = student.phone || '-'

                            return (
                                <div key={student.id} className="student-card">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={currentBgImage} className="absolute inset-0 w-full h-full object-fill z-0" alt="Background" />
                                    
                                    {(currentBgImage === '/id-templates/3_id_student.png' && schoolLogoUrl) && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={schoolLogoUrl} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[75%] h-auto opacity-20 z-[1] object-contain" alt="Watermark" />
                                    )}
                                    
                                    <div className="absolute text-center kh-moul leading-relaxed px-2 flex items-center justify-center" style={{ color: '#ff0000', width: '70%', left: '22%', top: '16%', height: '5%', fontSize: '11px', zIndex: 10 }}>
                                        {managementUnit1}
                                    </div>

                                    <div className="absolute w-full text-center kh-moul" style={{ color: '#0000ff', top: '24%', fontSize: '18px', zIndex: 10 }}>
                                        ប័ណ្ណសម្គាល់ខ្លួនសិស្ស
                                    </div>

                                    <div className="absolute w-full text-center text-black kh-moul" style={{ top: '30%', fontSize: '14px', zIndex: 10 }}>
                                        ឆ្នាំសិក្សា {academicYear}
                                    </div>
                                    
                                    <div className="absolute w-full text-center kh-moul" style={{ color: '#0000ff', top: '34%', fontSize: '15px', zIndex: 10 }}>
                                        {className}
                                    </div>

                                    <div className="absolute flex flex-col" style={{ width: '88%', left: '6%', top: '39%', fontSize: '13px', gap: '4px', zIndex: 10 }}>
                                        <div className="flex items-end">
                                            <span className="text-black whitespace-nowrap" style={{ marginBottom: '1px' }}>គោត្តនាម និងនាម:</span>
                                            <span className="kh-moul ml-2 flex-grow truncate text-center py-2" style={{ color: '#ff0000', fontSize: '14px', marginTop: '-8px', marginBottom: '-8px' }}>{student.name_kh || student.full_name || '-'}</span>
                                            <span className="text-black whitespace-nowrap ml-2" style={{ marginBottom: '1px' }}>ភេទ</span>
                                            <span className="kh-moul ml-2 text-center" style={{ color: '#ff0000', width: '40px', fontSize: '14px' }}>{student.gender || '-'}</span>
                                        </div>

                                        <div className="flex items-end">
                                            <span className="text-black whitespace-nowrap" style={{ marginBottom: '1px' }}>ថ្ងៃខែឆ្នាំកំណើត :</span>
                                            <span className="kh-moul ml-4 flex-grow" style={{ color: '#ff0000', fontSize: '14px' }}>{dob}</span>
                                        </div>

                                        <div className="flex items-start" style={{ marginTop: '2px' }}>
                                            <span className="text-black whitespace-nowrap">ទីកន្លែងកំណើត :</span>
                                            <span className="line-clamp-2 ml-2 flex-grow" style={{ color: '#ff0000', fontSize: '14px', lineHeight: 1.4 }}>{pob}</span>
                                        </div>

                                        <div className="flex items-end" style={{ marginTop: '2px' }}>
                                            <span className="text-black whitespace-nowrap" style={{ marginBottom: '1px' }}>ឈ្មោះឪពុក</span>
                                            <span className="kh-moul ml-2 truncate text-center py-2" style={{ color: '#ff0000', width: '30%', fontSize: '13px', marginTop: '-8px', marginBottom: '-8px' }}>{father}</span>
                                            <span className="text-black whitespace-nowrap ml-2" style={{ marginBottom: '1px' }}>ឈ្មោះម្តាយ</span>
                                            <span className="kh-moul ml-2 flex-grow truncate text-center py-2" style={{ color: '#ff0000', fontSize: '13px', marginTop: '-8px', marginBottom: '-8px' }}>{mother}</span>
                                        </div>

                                        <div className="flex items-end" style={{ marginTop: '2px' }}>
                                            <span className="text-black whitespace-nowrap" style={{ marginBottom: '1px' }}>លេខទូរសព្ទអាណាព្យាបាល :</span>
                                            <span className="kh-moul ml-4 flex-grow" style={{ color: '#ff0000', fontSize: '13px' }}>{phone}</span>
                                        </div>
                                    </div>

                                    <div className="absolute w-full flex justify-center items-end" style={{ top: '63%', fontSize: '12px', zIndex: 10 }}>
                                        <span className="text-black" style={{ marginBottom: '2px' }}>ជាសិស្ស</span>
                                        <span className="kh-moul ml-3 truncate py-2" style={{ color: '#0000ff', maxWidth: '64%', fontSize: '12px', marginTop: '-8px', marginBottom: '-8px' }}>{schoolName}</span>
                                    </div>

                                    <div className="absolute bg-white flex items-center justify-center overflow-hidden z-20" style={{ left: '9%', bottom: '8%', width: '25mm', height: '33mm', border: '1.5px solid #0000ff' }}>
                                        {student.photo_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={getDriveImageUrl(student.photo_url)} referrerPolicy="no-referrer" className="w-full h-full object-cover" alt="Student Photo" />
                                        ) : (
                                            <span className="font-sans font-bold tracking-widest" style={{ color: '#0000ff', fontSize: '10px' }}>3 X 4</span>
                                        )}
                                    </div>

                                    <div className="absolute flex flex-col items-center" style={{ right: '4%', bottom: '5%', width: '58%', zIndex: 10 }}>
                                        <div className="text-black text-center" style={{ fontSize: '10px', marginBottom: '2px' }}>
                                            ថ្ងៃពុធ ១៤រោច ខែពិសាខ ឆ្នាំរោង ឆស័ក ព.ស.២៥៦៨
                                        </div>
                                        <div className="text-black text-center mb-1" style={{ fontSize: '11px' }}>
                                            {provinceDate} ថ្ងៃទី១១ ខែមីនា ឆ្នាំ២០២៦
                                        </div>
                                        <div className="text-black kh-moul text-center z-20 mt-1" style={{ fontSize: '14px' }}>
                                            {director}
                                        </div>
                                        <div className="w-full flex items-center justify-center mt-1 z-10 pointer-events-none relative" style={{ height: '15mm' }}>
                                            {signatureImageSrc && (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={signatureImageSrc} className="object-contain origin-center transition-transform duration-200 absolute" style={{ top: '-15px', transform: `scale(${signatureScale})`, maxWidth: '100%', maxHeight: '100%' }} alt="Signature" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
