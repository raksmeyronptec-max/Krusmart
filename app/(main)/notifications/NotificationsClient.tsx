'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
    ArrowLeft, BellRing, Send, Info, AlertTriangle, Award, Paperclip, 
    History, Clock, Trash2, Loader2, MailX
} from 'lucide-react'
import { getNotifications, addNotification, deleteNotification } from './actions'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import type { Notification, Student } from '@/lib/types'
import { logger } from '@/lib/utils/logger'

/** The dropdown only needs the id and the Khmer name. */
type StudentOption = Pick<Student, 'id' | 'name_kh'>

export default function NotificationsClient({ initialStudents}: { initialStudents: StudentOption[] }) {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    
    // Form state
    const [target, setTarget] = useState('all')
    const [type, setType] = useState('info')
    const [title, setTitle] = useState('')
    const [message, setMessage] = useState('')

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        setIsLoading(true)
        const data = await getNotifications()
        setNotifications(data)
        setIsLoading(false)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!title || !message) return

        setIsSubmitting(true)
        try {
            const res = await addNotification({
                target,
                title,
                message,
                type
            })

            if (res.error) throw new Error(res.error)

            // Reset
            setTitle('')
            setMessage('')
            setType('info')
            setTarget('all')
            
            alert('✅ បានផ្ញើសារជូនដំណឹងដោយជោគជ័យ!')
            loadData()
        } catch (error: unknown) {
            logger.error(error)
            alert("បរាជ័យក្នុងការផ្ញើសារ។ សូមសាកល្បងម្តងទៀត។")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('តើអ្នកពិតជាចង់លុបសារជូនដំណឹងនេះមែនទេ? (មាតាបិតានឹងលែងឃើញវានៅក្នុង Portal ទៀតហើយ)')) return
        
        setIsLoading(true) // Use loading state to show spinner in list
        try {
            const res = await deleteNotification(id)
            if (res.error) throw new Error(res.error)
            
            loadData()
        } catch (error) {
            logger.error(error)
            alert("មិនអាចលុបបានទេ!")
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-paper text-text-heading pb-10">
            {/* Navbar */}
            <nav className="bg-brand text-white p-4 shadow-lg sticky top-0 z-50">
                <div className="container mx-auto max-w-6xl flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="flex items-center gap-2 hover:text-gold transition font-bold text-sm bg-white/10 px-3 py-1.5 rounded-lg">
                            <ArrowLeft className="w-4 h-4" /> ទំព័រដើម
                        </Link>
                        <h1 className="kh-moul text-lg hidden sm:block">ប្រព័ន្ធផ្ញើការជូនដំណឹង (Notifications)</h1>
                    </div>
                    <div className="bg-white/20 p-2 rounded-full">
                        <BellRing className="w-5 h-5 text-gold animate-pulse" />
                    </div>
                </div>
            </nav>

            <div className="container mx-auto max-w-6xl px-4 mt-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* Left Column: Compose */}
                    <div className="lg:col-span-5">
                        <div className="bg-white/95 backdrop-blur-md border border-white/50 rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.05)] p-6 border-t-4 border-t-[var(--brand)]">
                            <div className="flex items-center gap-3 mb-6 border-b pb-4">
                                <div className="bg-brand-100 p-2 rounded-lg text-brand"><Send className="w-5 h-5" /></div>
                                <h2 className="kh-moul text-lg text-text-heading">បង្កើតសារជូនដំណឹងថ្មី</h2>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                
                                <div>
                                    <label className="block text-sm font-bold text-text-body mb-1">ផ្ញើទៅកាន់៖</label>
                                    <SearchableSelect
                                        ariaLabel="អ្នកទទួល"
                                        required
                                        value={target}
                                        onChange={setTarget}
                                        options={[
                                            { value: 'all', label: '👨‍👩‍👧‍👦 សិស្សទាំងអស់ក្នុងថ្នាក់' },
                                            ...initialStudents.map(s => ({
                                                value: s.id,
                                                label: s.name_kh,
                                                group: 'ជ្រើសរើសសិស្សជាក់លាក់៖',
                                            })),
                                        ]}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-text-body mb-1">ប្រភេទសារ៖</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <label className="cursor-pointer">
                                            <input type="radio" name="notifType" value="info" checked={type === 'info'} onChange={() => setType('info')} className="peer hidden" />
                                            <div className="text-center p-2 rounded-xl border-2 border-divider peer-checked:border-brand-500 peer-checked:bg-brand-100 text-brand font-bold text-xs transition">
                                                <Info className="w-5 h-5 mx-auto mb-1" /> ព័ត៌មានទូទៅ
                                            </div>
                                        </label>
                                        <label className="cursor-pointer">
                                            <input type="radio" name="notifType" value="alert" checked={type === 'alert'} onChange={() => setType('alert')} className="peer hidden" />
                                            <div className="text-center p-2 rounded-xl border-2 border-divider peer-checked:border-danger peer-checked:bg-danger/10 text-danger font-bold text-xs transition">
                                                <AlertTriangle className="w-5 h-5 mx-auto mb-1" /> បន្ទាន់/ព្រមាន
                                            </div>
                                        </label>
                                        <label className="cursor-pointer">
                                            <input type="radio" name="notifType" value="success" checked={type === 'success'} onChange={() => setType('success')} className="peer hidden" />
                                            <div className="text-center p-2 rounded-xl border-2 border-divider peer-checked:border-success peer-checked:bg-success/10 text-success font-bold text-xs transition">
                                                <Award className="w-5 h-5 mx-auto mb-1" /> ការសរសើរ
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-text-body mb-1">ចំណងជើង៖</label>
                                    <input type="text" required placeholder="ឧ. ការប្រជុំមាតាបិតាសិស្ស, លទ្ធផលសិក្សា..." className="w-full p-3 rounded-xl border border-divider outline-none focus:border-brand focus:ring-4 focus:ring-focus-ring/20 bg-paper font-bold text-text-heading transition-all text-sm" value={title} onChange={e => setTitle(e.target.value)} />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-text-body mb-1">ខ្លឹមសារលម្អិត៖</label>
                                    <textarea required rows={4} placeholder="សូមសរសេរខ្លឹមសារសារនៅទីនេះ..." className="w-full p-3 rounded-xl border border-divider outline-none focus:border-brand focus:ring-4 focus:ring-focus-ring/20 bg-paper font-bold text-text-heading transition-all text-sm resize-none custom-scrollbar" value={message} onChange={e => setMessage(e.target.value)}></textarea>
                                </div>

                                <button type="submit" disabled={isSubmitting} className="w-full bg-brand hover:bg-brand-800 text-white font-bold py-3.5 rounded-xl shadow-lg transition flex items-center justify-center gap-2 mt-4 disabled:opacity-70">
                                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                                    {isSubmitting ? 'កំពុងផ្ញើ...' : 'ផ្ញើការជូនដំណឹងឥឡូវនេះ'}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Right Column: History */}
                    <div className="lg:col-span-7 flex flex-col h-[calc(100vh-8rem)] min-h-[500px]">
                        <div className="bg-white/95 backdrop-blur-md border border-white/50 rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.05)] flex-1 flex flex-col overflow-hidden">
                            <div className="p-5 border-b border-divider bg-paper/50 flex justify-between items-center shrink-0">
                                <h2 className="kh-moul text-text-heading text-base flex items-center gap-2">
                                    <History className="w-5 h-5 text-text-muted" /> ប្រវត្តិសារដែលបានផ្ញើ
                                </h2>
                                <span className="bg-brand-100 text-brand px-3 py-1 rounded-full text-xs font-bold">សរុប: {notifications.length}</span>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-paper/30">
                                {isLoading ? (
                                    <div className="text-center py-10 flex flex-col items-center gap-2">
                                        <Loader2 className="w-8 h-8 animate-spin text-text-muted" />
                                        <span className="text-text-muted font-bold">កំពុងទាញយក...</span>
                                    </div>
                                ) : notifications.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-text-muted opacity-60 pt-10">
                                        <MailX className="w-16 h-16 mb-3" />
                                        <p className="font-bold text-sm">មិនទាន់មានប្រវត្តិផ្ញើសារទេ</p>
                                    </div>
                                ) : (
                                    notifications.map(n => {
                                        let icon = <Info className="w-6 h-6" />
                                        let colorClass = 'text-brand bg-brand-100 border-divider'
                                        if (n.type === 'alert') { icon = <AlertTriangle className="w-6 h-6" />; colorClass = 'text-danger bg-danger/10 border-danger/30' }
                                        if (n.type === 'success') { icon = <Award className="w-6 h-6" />; colorClass = 'text-success bg-success/10 border-success/30' }

                                        let targetLabel = 'សិស្សទាំងអស់'
                                        let targetBadgeColor = 'bg-brand-100 text-brand'
                                        if (n.target !== 'all') {
                                            const st = initialStudents.find(s => s.id === n.target)
                                            targetLabel = st ? `ផ្ញើទៅ៖ ${st.name_kh}` : `ផ្ញើទៅ៖ ID ${n.target.substring(0,8)}`
                                            targetBadgeColor = 'bg-brand-100 text-brand'
                                        }

                                        const d = new Date(n.created_at)
                                        const dateStr = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`

                                        return (
                                            <div key={n.id} className="bg-white p-4 rounded-xl shadow-sm border border-divider hover:shadow-md transition relative group">
                                                <div className="flex gap-4">
                                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                                                        {icon}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                                            <h3 className="font-bold text-text-heading text-sm truncate">{n.title}</h3>
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${targetBadgeColor}`}>{targetLabel}</span>
                                                        </div>
                                                        <p className="text-xs text-text-muted leading-relaxed mb-2 whitespace-pre-wrap">{n.message}</p>
                                                        <span className="text-[10px] text-text-muted font-mono flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />{dateStr}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleDelete(n.id)} className="absolute top-4 right-4 p-2 text-text-muted hover:text-danger hover:bg-danger/5 rounded-full transition opacity-0 group-hover:opacity-100" title="លុបសារនេះ">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
            
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
            `}</style>
        </div>
    )
}
