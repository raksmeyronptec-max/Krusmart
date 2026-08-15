'use client'

import { useState } from 'react'
import { ArrowLeft, User, Building2, ShieldCheck, Save, Camera, Eye } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Settings } from '@/lib/types'
import { getErrorMessage } from '@/lib/utils/errors'
import { logger } from '@/lib/utils/logger'

export default function ProfileClient({ initialSettings }: { initialSettings: Settings | null }) {
    const supabase = createClient()
    const [settings, setSettings] = useState(initialSettings)
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Update settings
            const { error } = await supabase
                .from('settings')
                .upsert({ teacher_id: user.id, ...settings })

            if (error) throw error

            // Update password if provided
            if (password) {
                if (password !== confirmPassword) {
                    alert('ពាក្យសម្ងាត់មិនត្រូវគ្នាទេ!')
                    setLoading(false)
                    return
                }
                const { error: passError } = await supabase.auth.updateUser({ password })
                if (passError) throw passError
                setPassword('')
                setConfirmPassword('')
                alert('ពាក្យសម្ងាត់ត្រូវបានផ្លាស់ប្តូរដោយជោគជ័យ!')
            }

            alert('រក្សាទុកការកែប្រែដោយជោគជ័យ!')
        } catch (error: unknown) {
            logger.error('Error saving profile:', error)
            alert('មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ៖ ' + getErrorMessage(error))
        } finally {
            setLoading(false)
        }
    }

    const handleChange = (field: string, value: string) => {
        setSettings({ ...settings, [field]: value })
    }

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: string = 'photo_url') => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (event) => {
            const img = new Image()
            img.onload = () => {
                const canvas = document.createElement('canvas')
                const MAX_WIDTH = field === 'school_logo' ? 500 : 300
                const MAX_HEIGHT = field === 'school_logo' ? 500 : 300
                let width = img.width
                let height = img.height

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width
                        width = MAX_WIDTH
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height
                        height = MAX_HEIGHT
                    }
                }

                canvas.width = width
                canvas.height = height
                const ctx = canvas.getContext('2d')
                ctx?.drawImage(img, 0, 0, width, height)
                const dataUrl = canvas.toDataURL(field === 'school_logo' ? 'image/png' : 'image/jpeg', 0.8)
                handleChange(field, dataUrl)
            }
            img.src = event.target?.result as string
        }
        reader.readAsDataURL(file)
    }

    return (
        <div className="min-h-screen bg-bg-app text-text-heading font-battambang relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[220px] bg-gradient-to-br from-[var(--brand)] to-[var(--brand-500)] z-0"></div>
            
            <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
                <div className="flex justify-between items-center mb-8 text-white">
                    <Link href="/dashboard" className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg backdrop-blur-sm font-medium transition text-sm shadow-sm">
                        <ArrowLeft className="w-4 h-4" /> ត្រឡប់ទៅទំព័រដើម
                    </Link>
                    <h1 className="kh-moul text-xl tracking-wide text-white/90 hidden sm:block">គណនីរបស់អ្នកប្រើប្រាស់</h1>
                </div>

                <form onSubmit={handleSave} className="space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-divider p-6 md:p-8 mt-12 relative">
                        <div className="flex flex-col md:flex-row items-start md:items-end gap-6 md:gap-8 -mt-20 md:-mt-16 mb-6">
                            <div className="relative group mx-auto md:mx-0">
                                <div className="w-[140px] h-[140px] rounded-full border-[5px] border-white shadow-lg bg-white flex items-center justify-center overflow-hidden">
                                    {settings?.photo_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture
                                        <img src={settings?.photo_url} alt="Profile" className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-16 h-16 text-text-muted" />
                                    )}
                                </div>
                                <label className="absolute bottom-1 right-1 bg-white text-[var(--brand)] border border-divider p-2 rounded-full cursor-pointer shadow-md hover:scale-105 transition">
                                    <Camera className="w-5 h-5" />
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'photo_url')} />
                                </label>
                            </div>

                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
                                <div>
                                    <label className="flex items-center gap-2 text-sm font-semibold text-text-body mb-1"><User className="w-3.5 h-3.5" /> នាមត្រកូល</label>
                                    <input type="text" value={settings?.surname || ''} onChange={e => handleChange('surname', e.target.value)} className="w-full p-2.5 rounded-lg border border-divider bg-paper font-bold text-brand-800 focus:border-brand-500 focus:bg-white outline-none transition" placeholder="ឧ. រ៉ន" />
                                </div>
                                <div>
                                    <label className="flex items-center gap-2 text-sm font-semibold text-text-body mb-1"><User className="w-3.5 h-3.5" /> ឈ្មោះ</label>
                                    <input type="text" value={settings?.name || ''} onChange={e => handleChange('name', e.target.value)} className="w-full p-2.5 rounded-lg border border-divider bg-paper font-bold text-brand-800 focus:border-brand-500 focus:bg-white outline-none transition" placeholder="ឧ. រស្មី" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-divider p-6 md:p-8">
                        <div className="flex items-center gap-2 pb-3 border-b border-divider mb-5 text-[var(--brand)]">
                            <div className="bg-brand-100 p-2 rounded-lg text-brand">
                                <Building2 className="w-5 h-5" />
                            </div>
                            <h3 className="text-lg font-bold kh-moul">ព័ត៌មានរដ្ឋបាល និង សាលារៀន</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            <div>
                                <label className="flex items-center gap-1 text-sm font-semibold text-text-body mb-1"><span className="text-text-muted text-xs">១.</span> អង្គភាពគ្រប់គ្រង ១</label>
                                <input type="text" value={settings?.management_unit_1 || ''} onChange={e => handleChange('management_unit_1', e.target.value)} className="w-full p-2.5 rounded-lg border border-divider bg-paper focus:border-brand-500 focus:bg-white outline-none transition" />
                            </div>
                            <div>
                                <label className="flex items-center gap-1 text-sm font-semibold text-text-body mb-1"><span className="text-text-muted text-xs">២.</span> អង្គភាពគ្រប់គ្រង ២</label>
                                <input type="text" value={settings?.management_unit_2 || ''} onChange={e => handleChange('management_unit_2', e.target.value)} className="w-full p-2.5 rounded-lg border border-divider bg-paper focus:border-brand-500 focus:bg-white outline-none transition" />
                            </div>
                            <div>
                                <label className="flex items-center gap-1 text-sm font-semibold text-text-body mb-1"><span className="text-text-muted text-xs">៣.</span> ឈ្មោះសាលា</label>
                                <input type="text" value={settings?.school_name || ''} onChange={e => handleChange('school_name', e.target.value)} className="w-full p-2.5 rounded-lg border border-divider bg-paper font-bold text-text-heading focus:border-brand-500 focus:bg-white outline-none transition" />
                            </div>
                            <div>
                                <label className="flex items-center gap-1 text-sm font-semibold text-text-body mb-1"><span className="text-text-muted text-xs">៤.</span> ឈ្មោះថ្នាក់</label>
                                <input type="text" value={settings?.class_name || ''} onChange={e => handleChange('class_name', e.target.value)} className="w-full p-2.5 rounded-lg border border-divider bg-paper focus:border-brand-500 focus:bg-white outline-none transition" />
                            </div>
                            <div>
                                <label className="flex items-center gap-1 text-sm font-semibold text-text-body mb-1"><span className="text-text-muted text-xs">៥.</span> ឈ្មោះគ្រូបន្ទុក</label>
                                <input type="text" value={settings?.homeroom_teacher || ''} onChange={e => handleChange('homeroom_teacher', e.target.value)} className="w-full p-2.5 rounded-lg border border-divider bg-paper focus:border-brand-500 focus:bg-white outline-none transition" />
                            </div>
                            <div>
                                <label className="flex items-center gap-1 text-sm font-semibold text-text-body mb-1"><span className="text-text-muted text-xs">៦.</span> តួនាទីអ្នកគ្រប់គ្រង</label>
                                <input type="text" value={settings?.manager_role || ''} onChange={e => handleChange('manager_role', e.target.value)} className="w-full p-2.5 rounded-lg border border-divider bg-paper focus:border-brand-500 focus:bg-white outline-none transition" />
                            </div>
                            <div>
                                <label className="flex items-center gap-1 text-sm font-semibold text-text-body mb-1"><span className="text-text-muted text-xs">៧.</span> ខេត្ត (សម្រាប់ថ្ងៃខែ)</label>
                                <input type="text" value={settings?.province_for_date || ''} onChange={e => handleChange('province_for_date', e.target.value)} className="w-full p-2.5 rounded-lg border border-divider bg-paper focus:border-brand-500 focus:bg-white outline-none transition" />
                            </div>
                            <div>
                                <label className="flex items-center gap-1 text-sm font-semibold text-text-body mb-1"><span className="text-text-muted text-xs">៨.</span> ឆ្នាំសិក្សា</label>
                                <input type="text" value={settings?.academic_year || ''} onChange={e => handleChange('academic_year', e.target.value)} className="w-full p-2.5 rounded-lg border border-divider bg-paper focus:border-brand-500 focus:bg-white outline-none transition" />
                            </div>

                            {/* School Logo Upload */}
                            <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4 mt-2 p-4 border border-divider bg-brand-100/30 rounded-xl">
                                <label className="flex items-center gap-2 text-sm font-semibold text-[var(--brand)] mb-3">
                                    <Building2 className="w-4 h-4" /> ឡូហ្គោសាលា (School Logo)
                                </label>
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                                    <div className="w-[80px] h-[80px] rounded-lg border-2 border-dashed border-divider bg-white flex items-center justify-center overflow-hidden shrink-0">
                                        {settings?.school_logo ? (
                                            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture
                                            <img src={settings?.school_logo} alt="School Logo" className="w-full h-full object-contain p-1" />
                                        ) : (
                                            <Building2 className="w-8 h-8 text-brand-300" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <label className="inline-flex items-center gap-2 bg-white border border-divider text-brand px-4 py-2 rounded-lg cursor-pointer hover:bg-brand-100 transition shadow-sm text-sm font-bold">
                                            <Camera className="w-4 h-4" />
                                            <span>ជ្រើសរើសរូបឡូហ្គោសាលា</span>
                                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'school_logo')} />
                                        </label>
                                        <p className="text-[11px] sm:text-xs text-text-muted mt-2 leading-relaxed max-w-md">សូមជ្រើសរើសរូបភាពឡូហ្គោដែលមានផ្ទៃខាងក្រោយថ្លា (Transparent PNG) ដើម្បីភាពស្រស់ស្អាតពេលដាក់លើកាតសិស្ស ឬឯកសារផ្សេងៗ។</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-white to-paper rounded-xl shadow-sm border border-warning/30 p-6 md:p-8">
                        <div className="flex items-center gap-2 pb-3 border-b border-warning/30 mb-5 text-warning">
                            <div className="bg-warning/10 p-2 rounded-lg text-warning">
                                <ShieldCheck className="w-5 h-5" />
                            </div>
                            <h3 className="text-lg font-bold kh-moul">សុវត្ថិភាពគណនី (ប្តូរពាក្យសម្ងាត់)</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="flex items-center gap-1 text-sm font-semibold text-warning mb-1">ពាក្យសម្ងាត់ថ្មី (បើចង់ប្តូរ)</label>
                                <div className="relative">
                                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="w-full p-2.5 pl-4 pr-10 rounded-lg border border-warning/30 focus:border-warning outline-none transition bg-white" placeholder="........." />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-body">
                                        <Eye className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="flex items-center gap-1 text-sm font-semibold text-warning mb-1">បញ្ជាក់ពាក្យសម្ងាត់ថ្មី</label>
                                <div className="relative">
                                    <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full p-2.5 pl-4 pr-10 rounded-lg border border-warning/30 focus:border-warning outline-none transition bg-white" placeholder="........." />
                                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-body">
                                        <Eye className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button type="submit" disabled={loading} className="bg-gradient-to-r from-[var(--brand)] to-[var(--brand-500)] hover:from-[var(--brand-hover)] hover:to-[var(--brand-600)] text-white px-10 py-3.5 rounded-xl font-bold text-[15px] shadow-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 w-full md:w-auto min-w-[250px] disabled:opacity-50">
                            {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save className="w-5 h-5" />} 
                            {loading ? 'កំពុងរក្សាទុក...' : 'រក្សាទុកការកែប្រែ'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
