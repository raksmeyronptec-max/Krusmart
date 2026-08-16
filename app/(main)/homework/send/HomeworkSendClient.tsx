'use client'

import { useState, useEffect } from 'react'
import { 
    Send, Smartphone, FilePlus2, X,
    History, Inbox, CalendarClock, ZoomIn, Trash2, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { notify } from '@/components/ui/feedback/notify'
import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { getAssignments, addAssignment, deleteAssignment, uploadHomeworkPhoto } from './actions'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { getErrorMessageOr } from '@/lib/utils/errors'
import { logger } from '@/lib/utils/logger'
import type { HomeworkAssignment } from '@/lib/types'

const standardSubjects = [
    { group: 'ភាសាខ្មែរ', items: ['ភាសាខ្មែរ (គ្រប់បំណិន)', 'សមត្ថភាពស្តាប់', 'សមត្ថភាពសរសេរ', 'សមត្ថភាពអាន', 'សមត្ថភាពនិយាយ', 'អក្សរផ្ចង់', 'មេសូត្រ', 'តែងសេចក្តី'] },
    { group: 'គណិតវិទ្យា', items: ['គណិតវិទ្យា (គ្រប់ផ្នែក)', 'ចំនួន', 'រង្វាស់រង្វាល់', 'ធរណីមាត្រ', 'ពីជគណិត', 'ស្ថិតិ'] },
    { group: 'វិទ្យាសាស្ត្រ', items: ['វិទ្យាសាស្ត្រ (រួម)', 'រូបវិទ្យា', 'គីមីវិទ្យា', 'ជីវវិទ្យា', 'ផែនដីវិទ្យា-បរិស្ថាន', 'វិទ្យាសាស្ត្រអនុវត្តន៍'] },
    { group: 'សិក្សាសង្គម', items: ['សិក្សាសង្គម (រួម)', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 'ភូមិវិទ្យា', 'ប្រវត្តិវិទ្យា', 'គេហវិទ្យា-អប់រំសិល្បៈ'] },
    { group: 'អប់រំសុខភាព', items: ['អប់រំកាយ និងកីឡា', 'សុខភាព និងអនាម័យ'] },
    { group: 'ផ្សេងៗ', items: ['អប់រំបំណិនជីវិត', 'ភាសាបរទេស'] }
]

export default function HomeworkSendClient({ userId }: { userId: string }) {
    const [assignments, setAssignments] = useState<HomeworkAssignment[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    
    // Form state
    const [subject, setSubject] = useState('')
    const [title, setTitle] = useState('')
    const [desc, setDesc] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [imageBase64, setImageBase64] = useState<string | null>(null)
    // Bumping this remounts the file input, which is the only way to clear it.
    // A counter keeps render pure; `Date.now()` did not.
    const [fileInputKey, setFileInputKey] = useState(0)

    // Modal state
    const [photoModalSrc, setPhotoModalSrc] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const { confirm, dialog } = useConfirm()

    useEffect(() => {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        // eslint-disable-next-line react-hooks/set-state-in-effect -- default derives from the current date, which is impure and cannot run during render
        setDueDate(tomorrow.toISOString().split('T')[0])
        
        loadData()
    }, [])

    async function loadData() {
        setIsLoading(true)
        const data = await getAssignments()
        setAssignments(data)
        setIsLoading(false)
    }

    /**
     * Kept as a thin alias so the twelve call sites below read unchanged, but
     * routed through the app's one notification channel. The page previously
     * rendered its own toast stack, which could not be dismissed, stacked
     * behind dialogs, and used `animate-in` classes that resolve to nothing
     * (`tailwindcss-animate` is not installed).
     */
    const showToast = (message: string, type: 'success' | 'error' = 'success') =>
        type === 'error' ? notify.error(message) : notify.success(message)

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
             if (file.size > 10 * 1024 * 1024) {
                notify.error('ទំហំរូបថតធំពេក (លើសពី ១០MB)។ សូមជ្រើសរើសរូបថតតូចជាងនេះ។')
                setFileInputKey(k => k + 1)
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
        setFileInputKey(k => k + 1)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!subject || !title || !dueDate) return

        setIsSubmitting(true)
        try {
            let finalPhotoUrl = null

            if (imageBase64 && imageBase64.startsWith('data:image')) {
                // The upload runs on the server: the imgbb key used to be
                // appended here, which put it in the browser bundle.
                const customImageName = `HW_${userId.substring(0, 5)}_${subject.substring(0, 10)}`
                const upload = await uploadHomeworkPhoto(imageBase64, customImageName)

                if (upload.error || !upload.url) {
                    throw new Error(upload.error ?? 'មានបញ្ហាក្នុងការផ្ទុករូបភាព')
                }
                finalPhotoUrl = upload.url
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

    const handleDelete = async (assignment: HomeworkAssignment) => {
        // Name the assignment in the prompt. The old dialog asked only "តើអ្នក
        // ពិតជាចង់លុបមែនទេ?", which on a list of similar rows does not tell a
        // teacher which one they are about to remove.
        if (!(await confirm({
            title: 'លុបកិច្ចការផ្ទះ',
            message: `កិច្ចការ «${assignment.title}» នឹងត្រូវលុបចេញ ហើយអាណាព្យាបាលនឹងលែងឃើញវាទៀត។`,
            confirmLabel: 'លុប',
        }))) return

        setIsDeleting(true)
        try {
            const res = await deleteAssignment(assignment.id)
            if (res.error) throw new Error(res.error)

            showToast("លុបបានជោគជ័យ!")
            loadData()
        } catch (error) {
            logger.error(error)
            showToast("មិនអាចលុបបានទេ។ សូមសាកល្បងម្តងទៀត!", "error")
        } finally {
            setIsDeleting(false)
        }
    }

    /**
     * Subject badges. The hue is categorical — it tells a parent at a glance
     * which subject the homework is for — so the five stay visually distinct
     * rather than collapsing into the brand ramp. They are drawn from the
     * design system's own colours, not arbitrary Tailwind shades.
     */
    const getSubjectColor = (sub: string) => {
        if (sub.includes('គណិត')) return 'bg-danger/10 text-danger'
        if (sub.includes('ខ្មែរ')) return 'bg-gold/10 text-gold'
        if (sub.includes('វិទ្យាសាស្ត្រ')) return 'bg-success/10 text-success'
        if (sub.includes('សង្គម')) return 'bg-brand-500/10 text-brand-500'
        return 'bg-brand-100 text-brand-800'
    }

    return (
        <PageContainer>
            
            <PageHeader
                title="ផ្ញើកិច្ចការទៅអាណាព្យាបាល"
                description="កិច្ចការដែលបញ្ជូននឹងបង្ហាញនៅក្នុងកម្មវិធីអាណាព្យាបាល"
                actions={
                    <a
                        href="https://portal-parent-v2.vercel.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-11 items-center gap-2 rounded-lg border border-divider bg-brand-100 px-3 text-sm font-bold text-brand transition hover:border-brand-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring dark:bg-brand-900/60 dark:text-brand-300"
                    >
                        <Smartphone className="h-4 w-4" aria-hidden="true" /> Parent App
                    </a>
                }
            />

            <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-12">
                
                {/* Left Column */}
                <div className="lg:col-span-5">
                    <div className="bg-bg-surface p-5 md:p-6 rounded-xl shadow-sm border border-divider lg:sticky lg:top-36">
                        <h2 className="kh-moul text-lg text-brand mb-4 border-b border-divider pb-3 flex items-center gap-2">
                            <FilePlus2 className="w-5 h-5" /> បង្កើតកិច្ចការថ្មី
                        </h2>
                        
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-bold text-text-body mb-1">មុខវិជ្ជា <span className="text-danger">*</span></label>
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
                                <label className="block text-sm font-bold text-text-body mb-1">ចំណងជើងកិច្ចការ <span className="text-danger">*</span></label>
                                <input type="text" required placeholder="ឧ. លំហាត់គណិតវិទ្យាទំព័រ១២..." className="w-full p-2.5 rounded-lg border border-divider outline-none focus:border-brand-500 focus:ring-1 focus:ring-focus-ring/30 bg-paper" value={title} onChange={e => setTitle(e.target.value)} />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-text-body mb-1">ការណែនាំ / លម្អិត (ជម្រើស)</label>
                                <textarea rows={3} placeholder="សរសេរការណែនាំសម្រាប់សិស្ស និងអាណាព្យាបាល..." className="w-full p-2.5 rounded-lg border border-divider outline-none focus:border-brand-500 focus:ring-1 focus:ring-focus-ring/30 bg-paper custom-scrollbar" value={desc} onChange={e => setDesc(e.target.value)}></textarea>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-text-body mb-1">រូបភាពភ្ជាប់ (ជម្រើស)</label>
                                <input key={fileInputKey} type="file" accept="image/*" onChange={handleImageChange} className="w-full text-sm text-text-muted file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-brand-100 file:text-brand hover:file:bg-brand-100 cursor-pointer transition" />
                                
                                {imageBase64 && (
                                    <div className="relative mt-3 inline-block">
                                        {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture */}
                                        <img src={imageBase64} className="max-h-[200px] object-contain rounded-lg border border-divider bg-paper" alt="Preview" />
                                        <Button variant="danger" size="sm" printHidden={false} type="button" onClick={clearImage}>
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-text-body mb-1">ថ្ងៃផុតកំណត់ប្រគល់ (Due Date) <span className="text-danger">*</span></label>
                                <input type="date" required className="w-full p-2.5 rounded-lg border border-divider outline-none focus:border-brand-500 focus:ring-1 focus:ring-focus-ring/30 bg-paper" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                            </div>

                            <Button size="lg" printHidden={false} type="submit" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                {isSubmitting ? 'កំពុងបញ្ជូន...' : 'ផ្ញើទៅកាន់អាណាព្យាបាល'}
                            </Button>
                        </form>
                    </div>
                </div>

                {/* Right Column */}
                <div className="lg:col-span-7 flex flex-col h-[calc(100vh-140px)]">
                    <div className="bg-bg-surface p-5 md:p-6 rounded-xl shadow-sm border border-divider flex-1 flex flex-col overflow-hidden">
                        <h2 className="kh-moul text-lg text-success mb-4 border-b border-divider pb-3 flex justify-between items-center">
                            <span className="flex items-center gap-2">
                                <History className="w-5 h-5" /> ប្រវត្តិកិច្ចការផ្ទះដែលបានដាក់
                            </span>
                            <span className="text-xs bg-success/10 text-success px-3 py-1.5 rounded-lg border border-success/30 font-sans font-bold">សរុប៖ {assignments.length}</span>
                        </h2>

                        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 pr-2">
                            {isLoading ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-success gap-3">
                                    <Loader2 className="w-8 h-8 animate-spin" />
                                    <p className="font-bold">កំពុងទាញយកទិន្នន័យ...</p>
                                </div>
                            ) : assignments.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
                                    <div className="w-20 h-20 bg-paper rounded-full flex items-center justify-center mb-3 border border-divider">
                                        <Inbox className="w-10 h-10 text-text-muted" />
                                    </div>
                                    <p className="font-bold text-text-muted">មិនទាន់មានកិច្ចការផ្ទះនៅឡើយទេ</p>
                                    <p className="text-sm mt-1">កិច្ចការដែលអ្នកបង្កើតនឹងបង្ហាញនៅទីនេះ</p>
                                </div>
                            ) : (
                                assignments.map(a => {
                                    const d = new Date(a.due_date)
                                    const displayDate = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}`
                                    const subjectColor = getSubjectColor(a.subject)

                                    return (
                                        <div key={a.id} className="bg-bg-surface border border-divider p-4 md:p-5 rounded-xl shadow-sm hover:shadow-md transition group relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-1.5 h-full bg-brand"></div>
                                            <div className="flex justify-between items-start gap-4">
                                                <div className="flex-1">
                                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${subjectColor}`}>{a.subject}</span>
                                                        <span className="text-xs text-text-muted flex items-center gap-1 bg-paper px-2 py-1 rounded-full">
                                                            <CalendarClock className="w-3.5 h-3.5" /> ផុតកំណត់៖ <span className="text-danger font-bold">{displayDate}</span>
                                                        </span>
                                                    </div>
                                                    <h3 className="font-bold text-text-heading text-base md:text-lg mb-1 leading-tight">{a.title}</h3>
                                                    <p className="text-sm text-text-body line-clamp-2 md:line-clamp-none whitespace-pre-wrap">{a.description || <span className="italic text-text-muted">មិនមានការណែនាំលម្អិតទេ...</span>}</p>
                                                    
                                                    {a.image_url && (
                                                        <div className="mt-3 relative inline-block group/img cursor-pointer" onClick={() => setPhotoModalSrc(a.image_url)}>
                                                            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture */}
                                                            <img src={a.image_url} className="h-20 w-auto rounded-lg border border-divider object-cover shadow-sm group-hover/img:opacity-90 transition" alt="Homework" />
                                                            <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition">
                                                                <ZoomIn className="text-white w-6 h-6" />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                <Button variant="danger" printHidden={false} onClick={() => handleDelete(a)} disabled={isDeleting} title="លុបកិច្ចការនេះ">
                                                    <Trash2 className="w-5 h-5" />
                                                </Button>
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
                .custom-scrollbar::-webkit-scrollbar-track { background: var(--paper); }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--divider); border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
            `}</style>

            {/*
              The photo, full size. Replaces a hand-rolled overlay with no focus
              trap and no Escape handler.
            */}
            <Dialog
                open={photoModalSrc !== null}
                onClose={() => setPhotoModalSrc(null)}
                title="រូបភាពកិច្ចការផ្ទះ"
                size="lg"
            >
                {photoModalSrc && (
                    // eslint-disable-next-line @next/next/no-img-element -- user-uploaded remote image; next/image needs an allow-listed host
                    <img
                        src={photoModalSrc}
                        className="h-auto max-h-[70vh] w-full rounded-xl bg-paper object-contain"
                        alt="រូបភាពកិច្ចការផ្ទះ"
                    />
                )}
            </Dialog>

            {dialog}
        </PageContainer>
    )
}
