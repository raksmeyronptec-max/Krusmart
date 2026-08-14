'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
    ArrowLeft, BellRing, Send, Info, AlertTriangle, Award, Paperclip, 
    History, Clock, Trash2, Loader2, MailX
} from 'lucide-react'
import { getNotifications, addNotification, deleteNotification } from './actions'

export default function NotificationsClient({ initialStudents, userId }: { initialStudents: any[], userId: string }) {
    const [notifications, setNotifications] = useState<any[]>([])
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

    const loadData = async () => {
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
        } catch (error: any) {
            console.error(error)
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
            console.error(error)
            alert("មិនអាចលុបបានទេ!")
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#f4f7f9] text-slate-800 pb-10">
            {/* Navbar */}
            <nav className="bg-[#0054a6] text-white p-4 shadow-lg sticky top-0 z-50">
                <div className="container mx-auto max-w-6xl flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="flex items-center gap-2 hover:text-yellow-400 transition font-bold text-sm bg-white/10 px-3 py-1.5 rounded-lg">
                            <ArrowLeft className="w-4 h-4" /> ទំព័រដើម
                        </Link>
                        <h1 className="kh-moul text-lg hidden sm:block">ប្រព័ន្ធផ្ញើការជូនដំណឹង (Notifications)</h1>
                    </div>
                    <div className="bg-white/20 p-2 rounded-full">
                        <BellRing className="w-5 h-5 text-yellow-300 animate-pulse" />
                    </div>
                </div>
            </nav>

            <div className="container mx-auto max-w-6xl px-4 mt-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* Left Column: Compose */}
                    <div className="lg:col-span-5">
                        <div className="bg-white/95 backdrop-blur-md border border-white/50 rounded-3xl shadow-[0_10px_25px_rgba(0,0,0,0.05)] p-6 border-t-4 border-t-[#0054a6]">
                            <div className="flex items-center gap-3 mb-6 border-b pb-4">
                                <div className="bg-blue-100 p-2 rounded-lg text-[#0054a6]"><Send className="w-5 h-5" /></div>
                                <h2 className="kh-moul text-lg text-gray-800">បង្កើតសារជូនដំណឹងថ្មី</h2>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">ផ្ញើទៅកាន់៖</label>
                                    <select 
                                        required 
                                        className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-[#0054a6] focus:ring-4 focus:ring-blue-100 bg-slate-50 font-bold text-slate-800 transition-all cursor-pointer"
                                        value={target}
                                        onChange={e => setTarget(e.target.value)}
                                    >
                                        <option value="all" className="font-bold text-[#0054a6]">👨‍👩‍👧‍👦 សិស្សទាំងអស់ក្នុងថ្នាក់</option>
                                        <optgroup label="ជ្រើសរើសសិស្សជាក់លាក់៖">
                                            {initialStudents.map(s => (
                                                <option key={s.id} value={s.id}>{s.khmer_name} (ID: {s.id.substring(0, 8)}...)</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">ប្រភេទសារ៖</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <label className="cursor-pointer">
                                            <input type="radio" name="notifType" value="info" checked={type === 'info'} onChange={() => setType('info')} className="peer hidden" />
                                            <div className="text-center p-2 rounded-xl border-2 border-slate-200 peer-checked:border-blue-500 peer-checked:bg-blue-50 text-blue-600 font-bold text-xs transition">
                                                <Info className="w-5 h-5 mx-auto mb-1" /> ព័ត៌មានទូទៅ
                                            </div>
                                        </label>
                                        <label className="cursor-pointer">
                                            <input type="radio" name="notifType" value="alert" checked={type === 'alert'} onChange={() => setType('alert')} className="peer hidden" />
                                            <div className="text-center p-2 rounded-xl border-2 border-slate-200 peer-checked:border-red-500 peer-checked:bg-red-50 text-red-600 font-bold text-xs transition">
                                                <AlertTriangle className="w-5 h-5 mx-auto mb-1" /> បន្ទាន់/ព្រមាន
                                            </div>
                                        </label>
                                        <label className="cursor-pointer">
                                            <input type="radio" name="notifType" value="success" checked={type === 'success'} onChange={() => setType('success')} className="peer hidden" />
                                            <div className="text-center p-2 rounded-xl border-2 border-slate-200 peer-checked:border-green-500 peer-checked:bg-green-50 text-green-600 font-bold text-xs transition">
                                                <Award className="w-5 h-5 mx-auto mb-1" /> ការសរសើរ
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">ចំណងជើង៖</label>
                                    <input type="text" required placeholder="ឧ. ការប្រជុំមាតាបិតាសិស្ស, លទ្ធផលសិក្សា..." className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-[#0054a6] focus:ring-4 focus:ring-blue-100 bg-slate-50 font-bold text-slate-800 transition-all text-sm" value={title} onChange={e => setTitle(e.target.value)} />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">ខ្លឹមសារលម្អិត៖</label>
                                    <textarea required rows={4} placeholder="សូមសរសេរខ្លឹមសារសារនៅទីនេះ..." className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-[#0054a6] focus:ring-4 focus:ring-blue-100 bg-slate-50 font-bold text-slate-800 transition-all text-sm resize-none custom-scrollbar" value={message} onChange={e => setMessage(e.target.value)}></textarea>
                                </div>

                                <button type="submit" disabled={isSubmitting} className="w-full bg-[#0054a6] hover:bg-blue-800 text-white font-bold py-3.5 rounded-xl shadow-lg transition flex items-center justify-center gap-2 mt-4 disabled:opacity-70">
                                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                                    {isSubmitting ? 'កំពុងផ្ញើ...' : 'ផ្ញើការជូនដំណឹងឥឡូវនេះ'}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Right Column: History */}
                    <div className="lg:col-span-7 flex flex-col h-[calc(100vh-8rem)] min-h-[500px]">
                        <div className="bg-white/95 backdrop-blur-md border border-white/50 rounded-3xl shadow-[0_10px_25px_rgba(0,0,0,0.05)] flex-1 flex flex-col overflow-hidden">
                            <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center shrink-0">
                                <h2 className="kh-moul text-gray-800 text-base flex items-center gap-2">
                                    <History className="w-5 h-5 text-gray-500" /> ប្រវត្តិសារដែលបានផ្ញើ
                                </h2>
                                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">សរុប: {notifications.length}</span>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-50/30">
                                {isLoading ? (
                                    <div className="text-center py-10 flex flex-col items-center gap-2">
                                        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                                        <span className="text-gray-500 font-bold">កំពុងទាញយក...</span>
                                    </div>
                                ) : notifications.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400 opacity-60 pt-10">
                                        <MailX className="w-16 h-16 mb-3" />
                                        <p className="font-bold text-sm">មិនទាន់មានប្រវត្តិផ្ញើសារទេ</p>
                                    </div>
                                ) : (
                                    notifications.map(n => {
                                        let icon = <Info className="w-6 h-6" />
                                        let colorClass = 'text-blue-600 bg-blue-100 border-blue-200'
                                        if (n.type === 'alert') { icon = <AlertTriangle className="w-6 h-6" />; colorClass = 'text-red-600 bg-red-100 border-red-200' }
                                        if (n.type === 'success') { icon = <Award className="w-6 h-6" />; colorClass = 'text-green-600 bg-green-100 border-green-200' }

                                        let targetLabel = 'សិស្សទាំងអស់'
                                        let targetBadgeColor = 'bg-indigo-100 text-indigo-700'
                                        if (n.target !== 'all') {
                                            const st = initialStudents.find(s => s.id === n.target)
                                            targetLabel = st ? `ផ្ញើទៅ៖ ${st.khmer_name}` : `ផ្ញើទៅ៖ ID ${n.target.substring(0,8)}`
                                            targetBadgeColor = 'bg-purple-100 text-purple-700'
                                        }

                                        const d = new Date(n.created_at)
                                        const dateStr = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`

                                        return (
                                            <div key={n.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition relative group">
                                                <div className="flex gap-4">
                                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                                                        {icon}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                                            <h3 className="font-bold text-gray-800 text-sm truncate">{n.title}</h3>
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${targetBadgeColor}`}>{targetLabel}</span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 leading-relaxed mb-2 whitespace-pre-wrap">{n.message}</p>
                                                        <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />{dateStr}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleDelete(n.id)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition opacity-0 group-hover:opacity-100" title="លុបសារនេះ">
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
