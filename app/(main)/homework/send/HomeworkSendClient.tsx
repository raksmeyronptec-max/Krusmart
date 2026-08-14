'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
    ArrowLeft, Send, Smartphone, FilePlus2, X, AlertTriangle, 
    History, Inbox, CalendarClock, ZoomIn, Trash2, Loader2,
    CheckCircle, XCircle
} from 'lucide-react'
import { TopNav } from "@/components/TopNav"
import { getAssignments, addAssignment, deleteAssignment } from './actions'
import Image from 'next/image'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { getErrorMessageOr } from '@/lib/utils/errors'
import { logger } from '@/lib/utils/logger'

const standardSubjects = [
    { group: 'ភាសាខ្មែរ', items: ['ភាសាខ្មែរ (គ្រប់បំណិន)', 'សមត្ថភាពស្តាប់', 'សមត្ថភាពសរសេរ', 'សមត្ថភាពអាន', 'សមត្ថភាពនិយាយ', 'អក្សរផ្ចង់', 'មេសូត្រ', 'តែងសេចក្តី'] },
    { group: 'គណិតវិទ្យា', items: ['គណិតវិទ្យា (គ្រប់ផ្នែក)', 'ចំនួន', 'រង្វាស់រង្វាល់', 'ធរណីមាត្រ', 'ពីជគណិត', 'ស្ថិតិ'] },
    { group: 'វិទ្យាសាស្ត្រ', items: ['វិទ្យាសាស្ត្រ (រួម)', 'រូបវិទ្យា', 'គីមីវិទ្យា', 'ជីវវិទ្យា', 'ផែនដីវិទ្យា-បរិស្ថាន', 'វិទ្យាសាស្ត្រអនុវត្តន៍'] },
    { group: 'សិក្សាសង្គម', items: ['សិក្សាសង្គម (រួម)', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 'ភូមិវិទ្យា', 'ប្រវត្តិវិទ្យា', 'គេហវិទ្យា-អប់រំសិល្បៈ'] },
    { group: 'អប់រំសុខភាព', items: ['អប់រំកាយ និងកីឡា', 'សុខភាព និងអនាម័យ'] },
    { group: 'ផ្សេងៗ', items: ['អប់រំបំណិនជីវិត', 'ភាសាបរទេស'] }
]

export default function HomeworkSendClient({ userId }: { userId: string }) {
    const [assignments, setAssignments] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [toast, setToast] = useState<{message: string, type: 'success'|'error'} | null>(null)
    
    // Form state
    const [subject, setSubject] = useState('')
    const [title, setTitle] = useState('')
    const [desc, setDesc] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [imageBase64, setImageBase64] = useState<string | null>(null)
    const [fileInputKey, setFileInputKey] = useState(Date.now()) // to force reset file input

    // Modal state
    const [photoModalSrc, setPhotoModalSrc] = useState<string | null>(null)
    const [deleteModalId, setDeleteModalId] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    useEffect(() => {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        setDueDate(tomorrow.toISOString().split('T')[0])
        
        loadData()
    }, [])

    const loadData = async () => {
        setIsLoading(true)
        const data = await getAssignments()
        setAssignments(data)
        setIsLoading(false)
    }

    const showToast = (message: string, type: 'success'|'error' = 'success') => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
             if (file.size > 10 * 1024 * 1024) {
                alert('សូមអភ័យទោស ទំហំរូបថតធំពេក (លើសពី 10MB)។ សូមជ្រើសរើសរូបថតដែលមានទំហំតូចជាងនេះ។')
                setFileInputKey(Date.now())
                return
            }
            const reader = new FileReader()
            reader.onload = (e) => {
                setImageBase64(e.target?.result as string)
            }
            reader.readAsDataURL(file)
        }
    }

    const clearImage = () => {
        setImageBase64(null)
        setFileInputKey(Date.now())
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!subject || !title || !dueDate) return

        setIsSubmitting(true)
        try {
            let finalPhotoUrl = null

            if (imageBase64 && imageBase64.startsWith('data:image')) {
                const base64Data = imageBase64.split(',')[1]
                const formData = new FormData()
                formData.append('key', 'ccb0cd39984dae5017f41fdd627f4bb4')
                formData.append('image', base64Data)
                
                const customImageName = `HW_${userId.substring(0, 5)}_${subject.substring(0, 10)}`
                formData.append('name', customImageName)

                const uploadResponse = await fetch('https://api.imgbb.com/1/upload', {
                    method: 'POST',
                    body: formData
                })
                
                const uploadResult = await uploadResponse.json()
                
                if (uploadResult.success) {
                    finalPhotoUrl = uploadResult.data.url
                } else {
                    throw new Error("មានបញ្ហាក្នុងការ Upload រូបភាព។")
                }
            }

            const res = await addAssignment({
                subject,
                title,
                description: desc,
                due_date: dueDate,
                image_url: finalPhotoUrl,
                status: 'active'
            })

            if (res.error) throw new Error(res.error)

            // Reset
            setSubject('')
            setTitle('')
            setDesc('')
            clearImage()
            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            setDueDate(tomorrow.toISOString().split('T')[0])
            
            showToast("បញ្ជូនកិច្ចការផ្ទះបានជោគជ័យ!")
            loadData()
        } catch (error: unknown) {
            logger.error(error)
            showToast(getErrorMessageOr(error, "មានបញ្ហាក្នុងការបញ្ជូន។ សូមសាកល្បងម្តងទៀត!"), "error")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async () => {
        if (!deleteModalId) return
        
        setIsDeleting(true)
        try {
            const res = await deleteAssignment(deleteModalId)
            if (res.error) throw new Error(res.error)
            
            showToast("លុបបានជោគជ័យ!")
            loadData()
        } catch (error) {
            logger.error(error)
            showToast("មិនអាចលុបបានទេ។ សូមសាកល្បងម្តងទៀត!", "error")
        } finally {
            setIsDeleting(false)
            setDeleteModalId(null)
        }
    }

    const getSubjectColor = (sub: string) => {
        if (sub.includes('គណិត')) return 'bg-rose-100 text-rose-800'
        if (sub.includes('ខ្មែរ')) return 'bg-amber-100 text-amber-800'
        if (sub.includes('វិទ្យាសាស្ត្រ')) return 'bg-emerald-100 text-emerald-800'
        if (sub.includes('សង្គម')) return 'bg-purple-100 text-purple-800'
        return 'bg-blue-100 text-blue-800'
    }

    return (
        <div className="min-h-screen bg-[#f0f4f8] text-slate-800 flex flex-col">
            <TopNav />
            
            {/* Toast Notification */}
            {toast && (
                <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none animate-in slide-in-from-right">
                    <div className={`bg-white border-l-4 shadow-md px-5 py-3 rounded-md flex items-center gap-3 ${toast.type === 'success' ? 'border-emerald-500' : 'border-red-500'}`}>
                        {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
                        <span className="font-bold text-sm text-gray-700">{toast.message}</span>
                    </div>
                </div>
            )}

            {/* Modals */}
            {photoModalSrc && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000] flex items-center justify-center p-4" onClick={() => setPhotoModalSrc(null)}>
                    <div className="bg-white p-2 rounded-2xl shadow-2xl max-w-2xl w-full" onClick={e => e.stopPropagation()}>
                        <img src={photoModalSrc} className="w-full h-auto rounded-xl max-h-[80vh] object-contain bg-gray-50" alt="Homework Photo" />
                        <button onClick={() => setPhotoModalSrc(null)} className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-xl transition-colors">បិទរូបភាព</button>
                    </div>
                </div>
            )}

            {deleteModalId && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4 mx-auto">
                            <AlertTriangle className="w-6 h-6 text-red-600" />
                        </div>
                        <h3 className="text-center font-bold text-lg mb-2">បញ្ជាក់ការលុប</h3>
                        <p className="text-center text-gray-500 text-sm mb-6">តើអ្នកពិតជាចង់លុបមែនទេ?</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteModalId(null)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition">បោះបង់</button>
                            <button onClick={handleDelete} disabled={isDeleting} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition disabled:opacity-50 flex justify-center items-center">
                                {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'លុប'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white border-b border-gray-200 shadow-sm sticky top-16 z-40">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="text-gray-500 hover:text-[#0054a6] hover:bg-blue-50 p-2 rounded-xl transition">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="kh-moul text-[#0054a6] text-lg sm:text-xl flex items-center gap-2">
                            <Send className="w-5 h-5" /> ផ្ញើកិច្ចការទៅអាណាព្យាបាល
                        </h1>
                    </div>
                    <div className="text-sm font-bold bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-100 flex items-center gap-2">
                        <Smartphone className="w-4 h-4" /> Parent App <sub><a href="https://portal-parent-v2.vercel.app/" target="_blank" className="text-blue-600 hover:underline">Open App</a></sub>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-6 w-full grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
                
                {/* Left Column */}
                <div className="lg:col-span-5">
                    <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-gray-200 lg:sticky lg:top-36">
                        <h2 className="kh-moul text-lg text-[#0054a6] mb-4 border-b border-gray-100 pb-3 flex items-center gap-2">
                            <FilePlus2 className="w-5 h-5" /> បង្កើតកិច្ចការថ្មី
                        </h2>
                        
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">មុខវិជ្ជា <span className="text-red-500">*</span></label>
                                <SearchableSelect
                                    ariaLabel="មុខវិជ្ជា"
                                    required
                                    placeholder="-- ជ្រើសរើសមុខវិជ្ជា --"
                                    value={subject}
                                    onChange={setSubject}
                                    options={standardSubjects.flatMap(g =>
                                        g.items.map(item => ({ value: item, label: item, group: g.group }))
                                    )}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">ចំណងជើងកិច្ចការ <span className="text-red-500">*</span></label>
                                <input type="text" required placeholder="ឧ. លំហាត់គណិតវិទ្យាទំព័រ១២..." className="w-full p-2.5 rounded-lg border border-gray-300 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 bg-gray-50" value={title} onChange={e => setTitle(e.target.value)} />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">ការណែនាំ / លម្អិត (ជម្រើស)</label>
                                <textarea rows={3} placeholder="សរសេរការណែនាំសម្រាប់សិស្ស និងអាណាព្យាបាល..." className="w-full p-2.5 rounded-lg border border-gray-300 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 bg-gray-50 custom-scrollbar" value={desc} onChange={e => setDesc(e.target.value)}></textarea>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">រូបភាពភ្ជាប់ (ជម្រើស)</label>
                                <input key={fileInputKey} type="file" accept="image/*" onChange={handleImageChange} className="w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer transition" />
                                
                                {imageBase64 && (
                                    <div className="relative mt-3 inline-block">
                                        <img src={imageBase64} className="max-h-[200px] object-contain rounded-lg border border-gray-200 bg-gray-50" alt="Preview" />
                                        <button type="button" onClick={clearImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:scale-110 transition">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">ថ្ងៃផុតកំណត់ប្រគល់ (Due Date) <span className="text-red-500">*</span></label>
                                <input type="date" required className="w-full p-2.5 rounded-lg border border-gray-300 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 bg-gray-50" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                            </div>

                            <button type="submit" disabled={isSubmitting} className="mt-2 bg-[#0054a6] hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-blue-200 flex justify-center items-center gap-2 disabled:opacity-70">
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                {isSubmitting ? 'កំពុងបញ្ជូន...' : 'ផ្ញើទៅកាន់អាណាព្យាបាល'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Right Column */}
                <div className="lg:col-span-7 flex flex-col h-[calc(100vh-140px)]">
                    <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden">
                        <h2 className="kh-moul text-lg text-emerald-600 mb-4 border-b border-gray-100 pb-3 flex justify-between items-center">
                            <span className="flex items-center gap-2">
                                <History className="w-5 h-5" /> ប្រវត្តិកិច្ចការផ្ទះដែលបានដាក់
                            </span>
                            <span className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-100 font-sans font-bold">សរុប៖ {assignments.length}</span>
                        </h2>

                        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 pr-2">
                            {isLoading ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-emerald-600 gap-3">
                                    <Loader2 className="w-8 h-8 animate-spin" />
                                    <p className="font-bold">កំពុងទាញយកទិន្នន័យ...</p>
                                </div>
                            ) : assignments.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-3 border border-gray-100">
                                        <Inbox className="w-10 h-10 text-gray-300" />
                                    </div>
                                    <p className="font-bold text-gray-500">មិនទាន់មានកិច្ចការផ្ទះនៅឡើយទេ</p>
                                    <p className="text-sm mt-1">កិច្ចការដែលអ្នកបង្កើតនឹងបង្ហាញនៅទីនេះ</p>
                                </div>
                            ) : (
                                assignments.map(a => {
                                    const d = new Date(a.due_date)
                                    const displayDate = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}`
                                    const subjectColor = getSubjectColor(a.subject)

                                    return (
                                        <div key={a.id} className="bg-white border border-gray-100 p-4 md:p-5 rounded-2xl shadow-sm hover:shadow-md transition group relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-1.5 h-full bg-[#0054a6]"></div>
                                            <div className="flex justify-between items-start gap-4">
                                                <div className="flex-1">
                                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${subjectColor}`}>{a.subject}</span>
                                                        <span className="text-xs text-gray-500 flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-full">
                                                            <CalendarClock className="w-3.5 h-3.5" /> ផុតកំណត់៖ <span className="text-red-600 font-bold">{displayDate}</span>
                                                        </span>
                                                    </div>
                                                    <h3 className="font-bold text-gray-800 text-base md:text-lg mb-1 leading-tight">{a.title}</h3>
                                                    <p className="text-sm text-gray-600 line-clamp-2 md:line-clamp-none whitespace-pre-wrap">{a.description || <span className="italic text-gray-400">មិនមានការណែនាំលម្អិតទេ...</span>}</p>
                                                    
                                                    {a.image_url && (
                                                        <div className="mt-3 relative inline-block group/img cursor-pointer" onClick={() => setPhotoModalSrc(a.image_url)}>
                                                            <img src={a.image_url} className="h-20 w-auto rounded-lg border border-gray-200 object-cover shadow-sm group-hover/img:opacity-90 transition" alt="Homework" />
                                                            <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition">
                                                                <ZoomIn className="text-white w-6 h-6" />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                <button onClick={() => setDeleteModalId(a.id)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2.5 rounded-xl transition flex-shrink-0" title="លុបកិច្ចការនេះ">
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>
        </div>
    )
}
