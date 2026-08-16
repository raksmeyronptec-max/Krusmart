'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, User, Building2, ShieldCheck, Save, Camera, Eye, EyeOff, MapPin, Image as ImageIcon, Info, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import Select from '@/components/ui/forms/Select'
import { notify } from '@/components/ui/feedback/notify'
import type { Settings } from '@/lib/types'
import { getErrorMessage } from '@/lib/utils/errors'
import { logger } from '@/lib/utils/logger'

/**
 * The teacher's own profile and their school's administrative record.
 *
 * Almost every printed surface in the app — certificates, rankings, the honour
 * roll, parent reports, ID cards, the record book — reads its header and
 * signature block out of `settings`. This form is the only place those values
 * are ever written, so a field missing here is a row of dots on a document a
 * teacher hands to a parent or a ministry inspector.
 *
 * PAIRED COLUMNS
 * Migration 00002 introduced a second name for three fields the legacy form
 * already wrote, and different routes ended up reading different halves — so
 * the profile wrote `province_for_date` while six print views read
 * `province_date`, and every one of them printed placeholder dots. Each pair is
 * therefore driven by a single input and written to both columns; migration
 * 00013 backfills rows saved before this was fixed. See `PAIRED`.
 */

/**
 * One concept, two columns. Writing only one half is what broke printing, so
 * `setField` always writes both and `read` always accepts either.
 */
const PAIRED: Record<string, string> = {
    homeroom_teacher: 'teacher_name',
    province_for_date: 'province_date',
    director_name: 'manager_name',
}

/** Server-side columns that must not be echoed back on upsert. */
const READ_ONLY_COLUMNS = ['created_at', 'updated_at'] as const

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

type LocationTree = Record<string, Record<string, Record<string, string[]>>>

const inputClass =
    'w-full p-2.5 rounded-lg border border-divider bg-paper text-text-heading focus:border-brand-500 focus:bg-bg-surface focus:ring-2 focus:ring-focus-ring outline-none transition'

function FieldLabel({ num, children }: { num?: string; children: React.ReactNode }) {
    return (
        <label className="mb-1 flex items-center gap-1 text-sm font-semibold text-text-body">
            {num && <span className="text-xs text-text-muted">{num}</span>} {children}
        </label>
    )
}

export default function ProfileClient({ initialSettings }: { initialSettings: Settings | null }) {
    const supabase = createClient()
    const [settings, setSettings] = useState<Settings>(initialSettings ?? {})
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')

    const [locations, setLocations] = useState<LocationTree | null>(null)
    const [locationsLoading, setLocationsLoading] = useState(true)

    // Same source and loader as `/enrollment`, so the school's administrative
    // location and a pupil's address can never offer different place names.
    useEffect(() => {
        const controller = new AbortController()
        fetch('/locations.json', { signal: controller.signal })
            .then((res) => {
                if (!res.ok) throw new Error('Unable to load locations')
                return res.json()
            })
            .then((data: LocationTree) => setLocations(data))
            .catch((err: unknown) => {
                if ((err as { name?: string }).name !== 'AbortError') {
                    logger.error('Failed to load locations:', err)
                }
            })
            .finally(() => setLocationsLoading(false))
        return () => controller.abort()
    }, [])

    /** Read a field, accepting either half of a pair for rows saved before 00013. */
    const read = (field: keyof Settings & string): string => {
        const own = settings[field as keyof Settings]
        if (typeof own === 'string' && own) return own
        const twin = PAIRED[field]
        if (twin) {
            const other = settings[twin as keyof Settings]
            if (typeof other === 'string') return other
        }
        return ''
    }

    const setField = (field: string, value: string) => {
        setSettings((prev) => {
            const next = { ...prev, [field]: value }
            const twin = PAIRED[field]
            if (twin) next[twin as keyof Settings] = value as never
            return next
        })
    }

    const province = read('admin_province')
    const district = read('admin_district')

    const provinceOptions = useMemo(() => (locations ? Object.keys(locations) : []), [locations])
    const districtOptions = useMemo(
        () => Object.keys(locations?.[province] ?? {}),
        [locations, province],
    )
    const communeOptions = useMemo(
        () => Object.keys(locations?.[province]?.[district] ?? {}),
        [locations, province, district],
    )

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()

        // Validate before any write, so a mismatched password cannot leave the
        // settings saved and the teacher believing nothing happened.
        if ((password || confirmPassword) && password !== confirmPassword) {
            notify.error('ពាក្យសម្ងាត់ និងការបញ្ជាក់ពាក្យសម្ងាត់ មិនត្រូវគ្នាទេ')
            return
        }

        setLoading(true)
        const toastId = notify.loading('កំពុងរក្សាទុក...')

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                notify.settle(toastId, false, 'សូមចូលគណនីជាមុនសិន')
                return
            }

            const payload: Record<string, unknown> = { ...settings, teacher_id: user.id }
            for (const column of READ_ONLY_COLUMNS) delete payload[column]

            const { error } = await supabase.from('settings').upsert(payload)
            if (error) throw error

            if (password) {
                const { error: passError } = await supabase.auth.updateUser({ password })
                if (passError) throw passError
                setPassword('')
                setConfirmPassword('')
            }

            notify.settle(
                toastId,
                true,
                password ? 'រក្សាទុក និងប្តូរពាក្យសម្ងាត់ដោយជោគជ័យ' : 'រក្សាទុកដោយជោគជ័យ',
            )
        } catch (error: unknown) {
            logger.error('Error saving profile:', error)
            notify.settle(toastId, false, 'មិនអាចរក្សាទុកបានទេ៖ ' + getErrorMessage(error))
        } finally {
            setLoading(false)
        }
    }

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'photo_url' | 'school_logo') => {
        const file = e.target.files?.[0]
        if (!file) return

        // Guard before decoding: a 40MB phone photo would otherwise be read into
        // memory and canvas-resized before anyone could object.
        if (file.size > MAX_UPLOAD_BYTES) {
            notify.error('ទំហំរូបភាពធំពេក (លើសពី 5MB)។ សូមជ្រើសរើសរូបភាពតូចជាងនេះ')
            e.target.value = ''
            return
        }

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
                setField(field, dataUrl)
            }
            img.onerror = () => notify.error('មិនអាចអានរូបភាពនេះបានទេ')
            img.src = event.target?.result as string
        }
        reader.readAsDataURL(file)
    }

    return (
        <div className="min-h-screen bg-bg-app text-text-heading relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[220px] bg-gradient-to-br from-[var(--brand)] to-[var(--brand-500)] z-0"></div>

            <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
                <div className="flex justify-between items-center mb-8 text-white">
                    <Link href="/dashboard" className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg backdrop-blur-sm font-medium transition text-sm shadow-sm">
                        <ArrowLeft className="w-4 h-4" /> ត្រឡប់ទៅទំព័រដើម
                    </Link>
                    <h1 className="kh-moul text-xl tracking-wide text-white/90 hidden sm:block">គណនីរបស់អ្នកប្រើប្រាស់</h1>
                </div>

                <form onSubmit={handleSave} className="space-y-6">
                    {/* 1 — identity */}
                    <div className="bg-bg-surface rounded-xl shadow-sm border border-divider p-6 md:p-8 mt-12 relative">
                        <div className="flex flex-col md:flex-row items-start md:items-end gap-6 md:gap-8 -mt-20 md:-mt-16 mb-6">
                            <div className="relative group mx-auto md:mx-0">
                                <div className="w-[140px] h-[140px] rounded-full border-[5px] border-bg-surface shadow-lg bg-bg-surface flex items-center justify-center overflow-hidden">
                                    {settings?.photo_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture
                                        <img src={settings.photo_url} alt="រូបថតគ្រូ" className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-16 h-16 text-text-muted" />
                                    )}
                                </div>
                                <label className="tap-target absolute bottom-1 right-1 bg-bg-surface text-brand border border-divider p-2 rounded-full cursor-pointer shadow-md hover:scale-105 transition">
                                    <Camera className="w-5 h-5" />
                                    <span className="sr-only">ប្តូររូបថត</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'photo_url')} />
                                </label>
                            </div>

                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
                                <div>
                                    <FieldLabel><User className="w-3.5 h-3.5" /> នាមត្រកូល</FieldLabel>
                                    <input type="text" value={read('surname')} onChange={e => setField('surname', e.target.value)} className={`${inputClass} font-bold text-brand-800`} placeholder="ឧ. រ៉ន" />
                                </div>
                                <div>
                                    <FieldLabel><User className="w-3.5 h-3.5" /> ឈ្មោះ</FieldLabel>
                                    <input type="text" value={read('name')} onChange={e => setField('name', e.target.value)} className={`${inputClass} font-bold text-brand-800`} placeholder="ឧ. រស្មី" />
                                </div>
                                <div className="sm:col-span-2 lg:col-span-1">
                                    <FieldLabel>លេខទូរស័ព្ទ</FieldLabel>
                                    <input type="tel" inputMode="tel" value={read('phone')} onChange={e => setField('phone', e.target.value)} className={inputClass} placeholder="012 345 678" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2 — administrative and school record */}
                    <div className="bg-bg-surface rounded-xl shadow-sm border border-divider p-6 md:p-8">
                        <div className="flex items-center gap-2 pb-3 border-b border-divider mb-5 text-brand">
                            <div className="bg-brand-100 p-2 rounded-lg text-brand">
                                <Building2 className="w-5 h-5" />
                            </div>
                            <h3 className="text-lg font-bold kh-moul">ព័ត៌មានរដ្ឋបាល និង សាលារៀន</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            <div>
                                <FieldLabel num="១.">អង្គភាពគ្រប់គ្រង ១</FieldLabel>
                                <input type="text" value={read('management_unit_1')} onChange={e => setField('management_unit_1', e.target.value)} className={inputClass} placeholder="មន្ទីរអប់រំ យុវជន និងកីឡា..." />
                            </div>
                            <div>
                                <FieldLabel num="២.">អង្គភាពគ្រប់គ្រង ២</FieldLabel>
                                <input type="text" value={read('management_unit_2')} onChange={e => setField('management_unit_2', e.target.value)} className={inputClass} placeholder="ការិយាល័យអប់រំ យុវជន និងកីឡា..." />
                            </div>
                            <div>
                                <FieldLabel num="៣.">ឈ្មោះសាលា</FieldLabel>
                                <input type="text" value={read('school_name')} onChange={e => setField('school_name', e.target.value)} className={`${inputClass} font-bold`} placeholder="សាលាបឋមសិក្សា..." />
                            </div>
                            <div>
                                <FieldLabel num="៤.">លេខកូដសាលា</FieldLabel>
                                <input type="text" inputMode="numeric" value={read('school_code')} onChange={e => setField('school_code', e.target.value)} className={inputClass} placeholder="ឧ. 14090207006" />
                            </div>
                            <div>
                                <FieldLabel num="៥.">ឈ្មោះថ្នាក់</FieldLabel>
                                <input type="text" value={read('class_name')} onChange={e => setField('class_name', e.target.value)} className={inputClass} placeholder="ឧ. ថ្នាក់ទី៦ «ក»" />
                            </div>
                            <div>
                                <FieldLabel num="៦.">ឈ្មោះគ្រូបន្ទុក</FieldLabel>
                                <input type="text" value={read('homeroom_teacher')} onChange={e => setField('homeroom_teacher', e.target.value)} className={inputClass} placeholder="ឧ. រុន រស្មី" />
                                <p className="mt-1 text-[11px] text-text-muted">ឈ្មោះនេះបោះពុម្ពនៅកន្លែងចុះហត្ថលេខាគ្រូ។</p>
                            </div>
                            <div>
                                <Select
                                    label="៧. ភេទ"
                                    options={['ប្រុស', 'ស្រី']}
                                    value={read('gender')}
                                    placeholder="ជ្រើសរើសភេទ"
                                    onChange={(val) => setField('gender', val)}
                                />
                            </div>
                            <div>
                                <FieldLabel num="៨.">កម្រិតវប្បធម៌</FieldLabel>
                                <input type="text" value={read('education_level')} onChange={e => setField('education_level', e.target.value)} className={inputClass} placeholder="ឧ. បរិញ្ញាប័ត្រ" />
                            </div>
                            <div>
                                <FieldLabel num="៩.">កម្រិតបណ្តុះបណ្តាល</FieldLabel>
                                <input type="text" value={read('training_level')} onChange={e => setField('training_level', e.target.value)} className={inputClass} placeholder="ឧ. ១២+៤" />
                            </div>
                            <div>
                                <FieldLabel num="១០.">អតីតភាពឆ្នាំ</FieldLabel>
                                <input type="text" value={read('seniority_years')} onChange={e => setField('seniority_years', e.target.value)} className={inputClass} placeholder="ចំនួនឆ្នាំ" />
                            </div>
                            <div>
                                <FieldLabel num="១១.">តួនាទីអ្នកគ្រប់គ្រង</FieldLabel>
                                <input type="text" value={read('manager_role')} onChange={e => setField('manager_role', e.target.value)} className={inputClass} placeholder="ឧ. នាយកសាលា" />
                            </div>
                            <div>
                                <FieldLabel num="១១ក.">ឈ្មោះអ្នកគ្រប់គ្រង</FieldLabel>
                                <input type="text" value={read('director_name')} onChange={e => setField('director_name', e.target.value)} className={inputClass} placeholder="ឈ្មោះនាយកសាលា" />
                                <p className="mt-1 text-[11px] text-text-muted">បោះពុម្ពក្រោមតួនាទីខាងលើ លើឯកសារផ្លូវការ។</p>
                            </div>
                            <div>
                                <FieldLabel num="១២.">ខេត្ត (សម្រាប់ថ្ងៃខែ)</FieldLabel>
                                <input type="text" value={read('province_for_date')} onChange={e => setField('province_for_date', e.target.value)} className={inputClass} placeholder="ឧ. ព្រៃវែង" />
                                <p className="mt-1 text-[11px] text-text-muted">បង្ហាញក្នុងឃ្លា «ធ្វើនៅ ___ ថ្ងៃទី...»។</p>
                            </div>
                            <div>
                                <FieldLabel num="១៣.">ឆ្នាំសិក្សា</FieldLabel>
                                <input type="text" value={read('academic_year')} onChange={e => setField('academic_year', e.target.value)} className={inputClass} placeholder="ឧ. ២០២៥-២០២៦" />
                            </div>
                            <div>
                                <FieldLabel num="១៤.">លេខទូរស័ព្ទនាយកសាលា</FieldLabel>
                                <input type="tel" inputMode="tel" value={read('principal_phone')} onChange={e => setField('principal_phone', e.target.value)} className={inputClass} placeholder="ឧ. 012 345 678" />
                            </div>

                            {/* School logo */}
                            <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4 mt-2 p-4 border border-divider bg-brand-100/30 rounded-xl">
                                <FieldLabel num="១៤ក."><ImageIcon className="w-3.5 h-3.5 text-brand" /> រូបសញ្ញាសាលា (Logo)</FieldLabel>
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                                    <div className="w-[80px] h-[80px] rounded-lg border-2 border-dashed border-divider bg-bg-surface flex items-center justify-center overflow-hidden shrink-0">
                                        {settings?.school_logo ? (
                                            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture
                                            <img src={settings.school_logo} alt="រូបសញ្ញាសាលា" className="w-full h-full object-contain p-1" />
                                        ) : (
                                            <Building2 className="w-8 h-8 text-brand-300" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <label className="tap-target inline-flex cursor-pointer items-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 py-2 text-sm font-bold text-brand shadow-sm transition hover:bg-brand-100">
                                                <Camera className="w-4 h-4" />
                                                <span>ជ្រើសរើសរូបឡូហ្គោសាលា</span>
                                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'school_logo')} />
                                            </label>
                                            {settings?.school_logo && (
                                                <button
                                                    type="button"
                                                    onClick={() => setField('school_logo', '')}
                                                    className="tap-target inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-danger transition hover:bg-danger/10"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" /> លុបរូបសញ្ញា
                                                </button>
                                            )}
                                        </div>
                                        <p className="mt-2 flex items-start gap-1 text-[11px] leading-relaxed text-text-muted sm:text-xs">
                                            <Info className="mt-0.5 h-3 w-3 shrink-0" />
                                            ទំហំមិនលើសពី 5MB។ សូមប្រើរូបភាពផ្ទៃខាងក្រោយថ្លា (Transparent PNG) ដើម្បីភាពស្រស់ស្អាតលើកាតសិស្ស និងឯកសារផ្សេងៗ។
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3 — administrative location of the school */}
                    <div className="bg-bg-surface rounded-xl shadow-sm border border-divider p-6 md:p-8">
                        <div className="flex items-center gap-2 pb-3 border-b border-divider mb-5 text-brand">
                            <div className="bg-brand-100 p-2 rounded-lg text-brand">
                                <MapPin className="w-5 h-5" />
                            </div>
                            <h3 className="text-lg font-bold kh-moul">ទីតាំងរដ្ឋបាលនៃអង្គភាព</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <SearchableSelect
                                label="១៥. រាជធានី/ខេត្ត"
                                name="admin_province"
                                options={provinceOptions}
                                value={province}
                                loading={locationsLoading}
                                clearable
                                placeholder="ជ្រើសរើសរាជធានី/ខេត្ត"
                                onChange={(val) => {
                                    setField('admin_province', val)
                                    setField('admin_district', '')
                                    setField('admin_commune', '')
                                }}
                            />
                            <SearchableSelect
                                label="១៦. ក្រុង/ស្រុក/ខណ្ឌ"
                                name="admin_district"
                                options={districtOptions}
                                value={district}
                                disabled={!province}
                                clearable
                                placeholder={province ? 'ជ្រើសរើសក្រុង/ស្រុក/ខណ្ឌ' : 'ជ្រើសរើសខេត្តជាមុន...'}
                                onChange={(val) => {
                                    setField('admin_district', val)
                                    setField('admin_commune', '')
                                }}
                            />
                            <SearchableSelect
                                label="១៧. ឃុំ/សង្កាត់"
                                name="admin_commune"
                                options={communeOptions}
                                value={read('admin_commune')}
                                disabled={!district}
                                clearable
                                placeholder={district ? 'ជ្រើសរើសឃុំ/សង្កាត់' : 'ជ្រើសរើសស្រុកជាមុន...'}
                                onChange={(val) => setField('admin_commune', val)}
                            />
                        </div>
                    </div>

                    {/* 4 — account security */}
                    <div className="bg-bg-surface rounded-xl shadow-sm border border-warning/30 p-6 md:p-8">
                        <div className="flex items-center gap-2 pb-3 border-b border-warning/30 mb-5 text-warning">
                            <div className="bg-warning/10 p-2 rounded-lg text-warning">
                                <ShieldCheck className="w-5 h-5" />
                            </div>
                            <h3 className="text-lg font-bold kh-moul">សុវត្ថិភាពគណនី (ប្តូរពាក្យសម្ងាត់)</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <FieldLabel>ពាក្យសម្ងាត់ថ្មី (បើចង់ប្តូរ)</FieldLabel>
                                <div className="relative">
                                    <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className={`${inputClass} pr-11 border-warning/30 focus:border-warning`} placeholder="........." />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="tap-target absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-text-muted transition-colors hover:text-text-body" aria-label={showPassword ? 'លាក់ពាក្យសម្ងាត់' : 'បង្ហាញពាក្យសម្ងាត់'}>
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <FieldLabel>បញ្ជាក់ពាក្យសម្ងាត់ថ្មី</FieldLabel>
                                <div className="relative">
                                    <input type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={`${inputClass} pr-11 border-warning/30 focus:border-warning`} placeholder="........." />
                                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="tap-target absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-text-muted transition-colors hover:text-text-body" aria-label={showConfirmPassword ? 'លាក់ពាក្យសម្ងាត់' : 'បង្ហាញពាក្យសម្ងាត់'}>
                                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <p className="mt-3 flex items-center gap-1 text-xs text-text-muted">
                            <Info className="h-3 w-3" /> ទុកប្រអប់ចំហរ ប្រសិនបើអ្នកមិនចង់ប្តូរពាក្យសម្ងាត់។
                        </p>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button type="submit" disabled={loading} className="tap-target cursor-pointer bg-gradient-to-r from-[var(--brand)] to-[var(--brand-500)] hover:from-[var(--brand-hover)] hover:to-[var(--brand-600)] text-brand-contrast px-10 py-3.5 rounded-xl font-bold text-[15px] shadow-lg transition-all flex items-center justify-center gap-2 w-full md:w-auto min-w-[250px] disabled:cursor-not-allowed disabled:opacity-50">
                            {loading ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div> : <Save className="w-5 h-5" />}
                            {loading ? 'កំពុងរក្សាទុក...' : 'រក្សាទុកការកែប្រែ'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
