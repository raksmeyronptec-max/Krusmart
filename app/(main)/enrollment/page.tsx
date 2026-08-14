'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
    ArrowLeft, UserPlus, MapPin, Home, Award, Users, 
    FileText, Save, Download, FileSpreadsheet, Image as ImageIcon, Smile
} from 'lucide-react'
import Link from 'next/link'
import * as XLSX from 'xlsx-js-style'
import { TopNav } from "@/components/TopNav"
import { createStudent } from './actions'
import Select from '@/components/ui/forms/Select'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'

/** province → district → commune → villages[] */
type LocationTree = Record<string, Record<string, Record<string, string[]>>>

const YES_NO = ['ទេ', 'បាទ/ចាស']

export default function EnrollmentPage() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [photoUrl, setPhotoUrl] = useState('')
    const [showAvatarModal, setShowAvatarModal] = useState(false)
    const [showUrlModal, setShowUrlModal] = useState(false)
    const [dob, setDob] = useState('')
    const [age, setAge] = useState('')
    
    // Location Data
    const [locations, setLocations] = useState<LocationTree | null>(null)
    const [locationsLoading, setLocationsLoading] = useState(true)
    const [birthProv, setBirthProv] = useState('')
    const [birthDist, setBirthDist] = useState('')
    const [birthComm, setBirthComm] = useState('')
    const [birthVill, setBirthVill] = useState('')
    const [currProv, setCurrProv] = useState('')
    const [currDist, setCurrDist] = useState('')
    const [currComm, setCurrComm] = useState('')
    const [currVill, setCurrVill] = useState('')

    const fileInputRef = useRef<HTMLInputElement>(null)
    const formRef = useRef<HTMLFormElement>(null)

    useEffect(() => {
        fetch('/locations.json')
            .then(res => res.json())
            .then(data => setLocations(data))
            .catch(err => console.error("Failed to load locations:", err))
            .finally(() => setLocationsLoading(false))
    }, [])

    // Cascade option lists. Every level is looked up defensively — a stale or
    // unmatched parent value must yield an empty list, not a crash.
    const provinceOptions = locations ? Object.keys(locations) : []
    const birthDistrictOptions = Object.keys(locations?.[birthProv] ?? {})
    const birthCommuneOptions = Object.keys(locations?.[birthProv]?.[birthDist] ?? {})
    const birthVillageOptions = locations?.[birthProv]?.[birthDist]?.[birthComm] ?? []
    const currDistrictOptions = Object.keys(locations?.[currProv] ?? {})
    const currCommuneOptions = Object.keys(locations?.[currProv]?.[currDist] ?? {})
    const currVillageOptions = locations?.[currProv]?.[currDist]?.[currComm] ?? []

    // Age Calculation
    const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setDob(val)
        if (val) {
            const dobDate = new Date(val)
            const today = new Date()
            let calcAge = today.getFullYear() - dobDate.getFullYear()
            const m = today.getMonth() - dobDate.getMonth()
            if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
                calcAge--
            }
            setAge(calcAge >= 0 ? calcAge.toString() : '')
        } else {
            setAge('')
        }
    }

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                alert('សូមអភ័យទោស ទំហំរូបថតធំពេក (លើសពី 5MB)។')
                e.target.value = ''
                return
            }
            const reader = new FileReader()
            reader.onload = (event) => {
                setPhotoUrl(event.target?.result as string)
            }
            reader.readAsDataURL(file)
        }
    }

    const applyUrlPhoto = (url: string) => {
        let finalUrl = url.trim()
        if (finalUrl.includes('drive.google.com')) {
            const matchFileD = finalUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
            const matchId = finalUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/)
            let fileId = matchFileD ? matchFileD[1] : (matchId ? matchId[1] : null)
            if (fileId) {
                finalUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`
            }
        }
        setPhotoUrl(finalUrl)
        setShowUrlModal(false)
    }

    const selectAvatar = (seed: number, group: string) => {
        setPhotoUrl(`https://api.dicebear.com/7.x/${group}/svg?seed=${seed}`)
        setShowAvatarModal(false)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)

        if (!formRef.current) return

        const formData = new FormData(formRef.current)
        formData.append('photoUrl', photoUrl)
        
        const res = await createStudent(formData)
        
        setIsLoading(false)
        if (res?.error) {
            setError(res.error)
        } else {
            alert('រក្សាទុកបានជោគជ័យ!')
            router.push('/student-list')
        }
    }

    const downloadTemplate = () => {
        const link = document.createElement('a');
        link.href = '/sample_data.xlsx';
        link.download = 'sample_data.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsLoading(true)
        setError(null)
        
        try {
            let jsonData: any[] = [];
            
            if (file.name.endsWith('.csv')) {
                // Parse CSV manually (supports semicolon separator)
                const text = await file.text()
                const lines = text.split('\n').filter(line => line.trim().length > 0)
                if (lines.length > 0) {
                    // Check separator
                    const separator = lines[0].includes(';') ? ';' : ','
                    jsonData = lines.map(line => line.split(separator).map(cell => cell.trim().replace(/^"|"$/g, '')))
                }
            } else {
                // Parse Excel
                const data = await file.arrayBuffer()
                const workbook = XLSX.read(data)
                const worksheet = workbook.Sheets[workbook.SheetNames[0]]
                jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
            }
            
            if (jsonData.length <= 1) {
                alert('គ្មានទិន្នន័យសម្រាប់បញ្ចូលទេ!')
                setIsLoading(false)
                return
            }

            const rows = jsonData.slice(1) as any[]
            const students = rows.filter(row => row.length > 0 && row[0]).map(row => {
                // Parse Date (could be DD-MM-YYYY, or Excel date)
                let dobStr = row[5] || ""
                if (typeof dobStr === 'number') {
                    const date = new Date(Math.round((dobStr - 25569) * 86400 * 1000))
                    dobStr = date.toISOString().split('T')[0]
                } else if (typeof dobStr === 'string' && dobStr.includes('-')) {
                    // Convert DD-MM-YYYY to YYYY-MM-DD if necessary
                    const parts = dobStr.split('-')
                    if (parts.length === 3 && parts[0].length === 2) {
                        dobStr = `${parts[2]}-${parts[1]}-${parts[0]}`
                    }
                }

                // Match user's template columns
                // 0:អត្តលេខ, 1:ថ្នាក់ទី, 2:គោត្តនាម និងនាម, 3:ឈ្មោះឡាតាំង, 4:ភេទ, 5:ថ្ងៃខែឆ្នាំកំណើត, 6:លេខទូរស័ព្ទ, 
                // 7:ខេត្ត/ក្រុង(Birth), 8:ស្រុក/ខណ្ឌ, 9:ឃុំ/សង្កាត់, 10:ភូមិ, 
                // 11:ខេត្តបច្ចុប្បន្ន, 12:ស្រុកបច្ចុប្បន្ន, 13:ឃុំបច្ចុប្បន្ន, 14:ភូមិបច្ចុប្បន្ន,
                // 15:សិស្សថ្មី, 16:សិស្សត្រួត, 17:សិស្សកំព្រា, 18:សិស្សពិការ, 19:ក្រ១, 20:ក្រ២, 21:សិស្សសមធម៌, 22:អាហារូបករណ៍
                // 23:ឈ្មោះឪពុក, 24:មុខរបរឪពុក, 25:ឈ្មោះម្តាយ, 26:មុខរបរម្តាយ, 27:អាណាព្យាបាល, 28:មុខរបរអាណាព្យាបាល
                // 29:ជនជាតិដើមភាគតិច, 30:លក្ខណៈពិសេស, 31:ផ្សេងៗ, 32:link (photo)
                
                let poor_status = 'គ្មាន'
                if (row[19] && row[19].toString().trim() !== '') poor_status = 'ក្រ១'
                else if (row[20] && row[20].toString().trim() !== '') poor_status = 'ក្រ២'

                let orphan_status = 'ទេ'
                if (row[17] && row[17].toString().trim() !== '') {
                    const o = row[17].toString().trim()
                    if (o.includes('ទាំងពីរ')) orphan_status = 'កំព្រាទាំងពីរ'
                    else if (o.includes('ម្តាយ')) orphan_status = 'កំព្រាម្តាយ'
                    else if (o.includes('ឪពុក')) orphan_status = 'កំព្រាឪពុក'
                    else orphan_status = 'កំព្រាទាំងពីរ' // Default if they just put 'x'
                }

                return {
                    student_id: row[0]?.toString() || "",
                    grade: row[1]?.toString() || "",
                    name_kh: row[2]?.toString() || "",
                    name_latin: row[3]?.toString() || "",
                    gender: row[4]?.toString() || "",
                    dob: dobStr,
                    phone: row[6]?.toString() || "",
                    
                    birth_province: row[7]?.toString() || "",
                    birth_district: row[8]?.toString() || "",
                    birth_commune: row[9]?.toString() || "",
                    birth_village: row[10]?.toString() || "",
                    
                    curr_province: row[11]?.toString() || "",
                    curr_district: row[12]?.toString() || "",
                    curr_commune: row[13]?.toString() || "",
                    curr_village: row[14]?.toString() || "",
                    
                    is_new_student: !!(row[15] && row[15].toString().trim() !== ''),
                    is_repeater: !!(row[16] && row[16].toString().trim() !== ''),
                    orphan_status,
                    is_disabled: !!(row[18] && row[18].toString().trim() !== ''),
                    poor_status,
                    is_equity: !!(row[21] && row[21].toString().trim() !== ''),
                    is_scholarship: !!(row[22] && row[22].toString().trim() !== ''),

                    father_name: row[23]?.toString() || "",
                    father_job: row[24]?.toString() || "",
                    mother_name: row[25]?.toString() || "",
                    mother_job: row[26]?.toString() || "",
                    guardian_name: row[27]?.toString() || "",
                    guardian_job: row[28]?.toString() || "",

                    ethnicity: row[29]?.toString() || "",
                    special_features: row[30]?.toString() || "",
                    other_remarks: row[31]?.toString() || "",
                    photo_url: row[32]?.toString() || ""
                }
            })

            const { importStudents } = await import('./actions')
            const result = await importStudents(students)
            if (result?.error) {
                setError(result.error)
            } else {
                alert(`បញ្ចូលទិន្នន័យបានសម្រេច ${students.length} នាក់!`)
                router.push('/student-list')
            }
        } catch (err: any) {
            setError("មានបញ្ហាក្នុងការអានឯកសារ Excel: " + err.message)
        } finally {
            setIsLoading(false)
            e.target.value = ''
        }
    }

    return (
        <div className="min-h-screen bg-[#f4f7fb] dark:bg-gray-900 pb-24 transition-colors">
            <TopNav />

            <div className="container mx-auto p-4 md:p-6 max-w-5xl mt-4">
                <form ref={formRef} onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden relative transition-colors">
                    <div className="h-2 w-full bg-[#2da143]"></div>
                    
                    <div className="p-6 md:p-8">
                        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3 mb-6">
                            <h2 className="kh-moul text-[#322a83] dark:text-[#4facfe] text-xl">គ្រប់គ្រងបញ្ជីសិស្ស</h2>
                        </div>

                        {error && (
                            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm font-bold">
                                {error}
                            </div>
                        )}
                        
                        <div className="flex flex-col md:flex-row gap-8 lg:gap-12 mb-2">
                            {/* Avatar Section */}
                            <div className="flex flex-col items-center gap-3 w-32 flex-shrink-0">
                                <label className="text-[13px] font-bold text-gray-600 dark:text-gray-300">រូបតំណាង</label>
                                
                                <div 
                                    className="w-[100px] h-[100px] border-2 border-indigo-500 rounded-xl flex justify-center items-center overflow-hidden bg-white cursor-pointer hover:border-indigo-700 transition-all relative group"
                                    onClick={() => setShowAvatarModal(true)}
                                >
                                    {photoUrl ? (
                                        <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" onError={() => setPhotoUrl('')} />
                                    ) : (
                                        <ImageIcon className="w-10 h-10 text-gray-300" />
                                    )}
                                </div>
                                
                                <div className="flex flex-col w-full gap-2 mt-1">
                                    <button type="button" onClick={() => setShowAvatarModal(true)} className="text-[11px] bg-[#f0fdf4] text-[#16a34a] w-full py-1.5 rounded border border-[#bbf7d0] hover:bg-[#dcfce7] font-bold transition-colors flex justify-center items-center gap-1">
                                        <Smile className="w-3 h-3" /> ជ្រើសរូបតុក្កតា
                                    </button>
                                    <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[11px] bg-[#edf2ff] text-[#4f46e5] w-full py-1.5 rounded border border-[#c7d2fe] hover:bg-[#e0e7ff] font-bold transition-colors">ជ្រើសរូបផ្ទាល់</button>
                                    <button type="button" onClick={() => setShowUrlModal(true)} className="text-[11px] bg-[#f9fafb] text-[#4b5563] w-full py-1.5 rounded border border-[#e5e7eb] hover:bg-[#f3f4f6] font-bold transition-colors">ប្រើរូបភាពពីURL</button>
                                </div>
                                <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                            </div>

                            {/* Form Grid */}
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
                                
                                {/* Row 1 */}
                                <div className="flex flex-col">
                                    <label className="text-[13px] font-bold text-gray-600 dark:text-gray-300 mb-1">អត្តលេខ*</label>
                                    <input name="studentId" required type="text" placeholder="អត្តលេខ" className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white font-bold text-indigo-900 dark:text-indigo-300" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-[13px] font-bold text-gray-600 dark:text-gray-300 mb-1">ថ្នាក់ទី*</label>
                                    <input name="grade" required type="text" placeholder="ឧ. ១ក" className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-[13px] font-bold text-gray-600 dark:text-gray-300 mb-1">ឈ្មោះសិស្ស (ខ្មែរ)*</label>
                                    <input name="studentName" required type="text" placeholder="គោត្តនាម និងនាម" className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white" />
                                </div>

                                {/* Row 2 */}
                                <div className="flex flex-col">
                                    <label className="text-[13px] font-bold text-gray-600 dark:text-gray-300 mb-1">ឈ្មោះសិស្សជាអក្សរឡាតាំង</label>
                                    <input name="latinName" type="text" placeholder="Latin Name" className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white" />
                                </div>
                                <Select
                                    name="gender"
                                    label="ភេទ"
                                    required
                                    placeholder="ជ្រើសរើស"
                                    options={['ប្រុស', 'ស្រី']}
                                />
                                <div className="flex flex-col">
                                    <label className="text-[13px] font-bold text-gray-600 dark:text-gray-300 mb-1">ថ្ងៃខែឆ្នាំកំណើត*</label>
                                    <input name="dob" required type="date" value={dob} onChange={handleDobChange} className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-[13px] font-bold text-gray-600 dark:text-gray-300 mb-1">អាយុ (ឆ្នាំ)</label>
                                    <input type="text" value={age} readOnly placeholder="គណនាស្វ័យប្រវត្តិ" className="border border-gray-200 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-500 font-bold outline-none cursor-not-allowed" />
                                </div>
                                <div className="flex flex-col md:col-span-2">
                                    <label className="text-[13px] font-bold text-gray-600 dark:text-gray-300 mb-1">លេខទូរស័ព្ទអាណាព្យាបាល</label>
                                    <input name="phone" type="text" placeholder="លេខទូរស័ព្ទ" className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-700 dark:text-white" />
                                </div>

                                {/* Address Section */}
                                <div className="md:col-span-2 lg:col-span-3 mt-4 mb-2 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                                    <MapPin className="w-4 h-4 text-emerald-600" />
                                    <h3 className="text-sm font-bold text-[#322a83] dark:text-[#4facfe]">ទីកន្លែងកំណើត</h3>
                                </div>
                                <SearchableSelect
                                    name="birthProvince"
                                    ariaLabel="រាជធានី/ខេត្ត កំណើត"
                                    placeholder="រាជធានី/ខេត្ត"
                                    options={provinceOptions}
                                    value={birthProv}
                                    loading={locationsLoading}
                                    clearable
                                    onChange={v => { setBirthProv(v); setBirthDist(''); setBirthComm(''); setBirthVill('') }}
                                />
                                <SearchableSelect
                                    name="birthDistrict"
                                    ariaLabel="ក្រុង/ស្រុក/ខណ្ឌ កំណើត"
                                    placeholder="ក្រុង/ស្រុក/ខណ្ឌ"
                                    options={birthDistrictOptions}
                                    value={birthDist}
                                    disabled={!birthProv}
                                    clearable
                                    onChange={v => { setBirthDist(v); setBirthComm(''); setBirthVill('') }}
                                />
                                <SearchableSelect
                                    name="birthCommune"
                                    ariaLabel="ឃុំ/សង្កាត់ កំណើត"
                                    placeholder="ឃុំ/សង្កាត់"
                                    options={birthCommuneOptions}
                                    value={birthComm}
                                    disabled={!birthDist}
                                    clearable
                                    onChange={v => { setBirthComm(v); setBirthVill('') }}
                                />
                                <SearchableSelect
                                    name="birthVillage"
                                    ariaLabel="ភូមិ កំណើត"
                                    placeholder="ភូមិ"
                                    options={birthVillageOptions}
                                    value={birthVill}
                                    disabled={!birthComm}
                                    clearable
                                    onChange={setBirthVill}
                                />

                                <div className="md:col-span-2 lg:col-span-3 mt-4 mb-2 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                                    <Home className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-sm font-bold text-[#322a83] dark:text-[#4facfe]">អាសយដ្ឋានសព្វថ្ងៃ</h3>
                                </div>
                                <SearchableSelect
                                    name="currProvince"
                                    ariaLabel="រាជធានី/ខេត្ត សព្វថ្ងៃ"
                                    placeholder="រាជធានី/ខេត្ត"
                                    options={provinceOptions}
                                    value={currProv}
                                    loading={locationsLoading}
                                    clearable
                                    onChange={v => { setCurrProv(v); setCurrDist(''); setCurrComm(''); setCurrVill('') }}
                                />
                                <SearchableSelect
                                    name="currDistrict"
                                    ariaLabel="ក្រុង/ស្រុក/ខណ្ឌ សព្វថ្ងៃ"
                                    placeholder="ក្រុង/ស្រុក/ខណ្ឌ"
                                    options={currDistrictOptions}
                                    value={currDist}
                                    disabled={!currProv}
                                    clearable
                                    onChange={v => { setCurrDist(v); setCurrComm(''); setCurrVill('') }}
                                />
                                <SearchableSelect
                                    name="currCommune"
                                    ariaLabel="ឃុំ/សង្កាត់ សព្វថ្ងៃ"
                                    placeholder="ឃុំ/សង្កាត់"
                                    options={currCommuneOptions}
                                    value={currComm}
                                    disabled={!currDist}
                                    clearable
                                    onChange={v => { setCurrComm(v); setCurrVill('') }}
                                />
                                <SearchableSelect
                                    name="currVillage"
                                    ariaLabel="ភូមិ សព្វថ្ងៃ"
                                    placeholder="ភូមិ"
                                    options={currVillageOptions}
                                    value={currVill}
                                    disabled={!currComm}
                                    clearable
                                    onChange={setCurrVill}
                                />

                                {/* Status */}
                                <div className="md:col-span-2 lg:col-span-3 mt-4 mb-2 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                                    <Award className="w-4 h-4 text-orange-600" />
                                    <h3 className="text-sm font-bold text-[#322a83] dark:text-[#4facfe]">ស្ថានភាព និងអាហារូបករណ៍</h3>
                                </div>
                                <Select name="isNewStudent" label="សិស្សថ្មី" options={YES_NO} defaultValue="ទេ" />
                                <Select name="isRepeater" label="សិស្សត្រួតថ្នាក់" options={YES_NO} defaultValue="ទេ" />
                                <Select
                                    name="orphanStatus"
                                    label="ស្ថានភាពគ្រួសារ (កំព្រា)"
                                    options={['ទេ', 'កំព្រាឪពុក', 'កំព្រាម្តាយ', 'កំព្រាទាំងពីរ']}
                                    defaultValue="ទេ"
                                />
                                <Select name="isDisabled" label="ពិការភាព" options={YES_NO} defaultValue="ទេ" />
                                <Select
                                    name="poorStatus"
                                    label="ប័ណ្ណក្រីក្រ"
                                    options={['គ្មាន', 'ក្រ១', 'ក្រ២']}
                                    defaultValue="គ្មាន"
                                />
                                <Select name="isEquity" label="សិស្សសមធម៌" options={YES_NO} defaultValue="ទេ" />
                                <Select name="isScholarship" label="អាហារូបករណ៍" options={YES_NO} defaultValue="ទេ" />

                                {/* Parents */}
                                <div className="md:col-span-2 lg:col-span-3 mt-4 mb-2 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                                    <Users className="w-4 h-4 text-pink-600" />
                                    <h3 className="text-sm font-bold text-[#322a83] dark:text-[#4facfe]">ព័ត៌មានឪពុកម្តាយ និងអាណាព្យាបាល</h3>
                                </div>
                                <div className="flex flex-col"><input name="fatherName" type="text" placeholder="ឈ្មោះឪពុក" className="border border-pink-100 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 outline-none dark:bg-gray-700 dark:text-white" /></div>
                                <div className="flex flex-col"><input name="fatherJob" type="text" placeholder="មុខរបរ" className="border border-pink-100 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 outline-none dark:bg-gray-700 dark:text-white" /></div>
                                <div className="hidden lg:block"></div>
                                <div className="flex flex-col"><input name="motherName" type="text" placeholder="ឈ្មោះម្តាយ" className="border border-pink-100 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 outline-none dark:bg-gray-700 dark:text-white" /></div>
                                <div className="flex flex-col"><input name="motherJob" type="text" placeholder="មុខរបរ" className="border border-pink-100 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 outline-none dark:bg-gray-700 dark:text-white" /></div>
                                <div className="hidden lg:block"></div>
                                <div className="flex flex-col"><input name="guardianName" type="text" placeholder="ឈ្មោះអាណាព្យាបាល" className="border border-pink-200 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 outline-none dark:bg-gray-700 dark:text-white" /></div>
                                <div className="flex flex-col"><input name="guardianJob" type="text" placeholder="មុខរបរ" className="border border-pink-200 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 outline-none dark:bg-gray-700 dark:text-white" /></div>

                                {/* Additional */}
                                <div className="md:col-span-2 lg:col-span-3 mt-4 mb-2 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                                    <FileText className="w-4 h-4 text-purple-600" />
                                    <h3 className="text-sm font-bold text-[#322a83] dark:text-[#4facfe]">ព័ត៌មានបន្ថែមផ្សេងៗ</h3>
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-[13px] font-bold text-purple-700 dark:text-purple-400 mb-1">ជនជាតិដើមភាគតិច</label>
                                    <input name="ethnicity" type="text" placeholder="ឧ. ព្នង, គួយ..." className="border border-purple-200 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none dark:bg-gray-700 dark:text-white" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-[13px] font-bold text-purple-700 dark:text-purple-400 mb-1">លក្ខណៈពិសេស</label>
                                    <input name="specialFeatures" type="text" placeholder="លក្ខណៈផ្សេងៗ..." className="border border-purple-200 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none dark:bg-gray-700 dark:text-white" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-[13px] font-bold text-purple-700 dark:text-purple-400 mb-1">សេចក្តីផ្សេងៗ</label>
                                    <input name="otherRemarks" type="text" placeholder="ព័ត៌មានបន្ថែមផ្សេងៗ..." className="border border-purple-200 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none dark:bg-gray-700 dark:text-white" />
                                </div>
                            </div>
                        </div>

                        {/* Notice Info */}
                        <div className="mt-6 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-[12px] text-blue-800 dark:text-blue-200 flex items-start gap-2 border border-blue-100 dark:border-blue-800">
                            <span className="font-bold flex-shrink-0">i</span>
                            <div>
                                <span>បញ្ជាក់: ចំពោះព័ត៌មានដែលមានសញ្ញា * ត្រូវតែបំពេញឱ្យបានគ្រប់ជ្រុងជ្រោយ។ អាយុនឹងត្រូវបានគណនាដោយស្វ័យប្រវត្តិ។</span><br/>
                                <span className="font-bold text-red-600 dark:text-red-400 mt-1 block">ចំណាំ: ចំនួនសិស្សអតិបរមាក្នុងមួយថ្នាក់គឺកំណត់ត្រឹម ១០០នាក់ ប៉ុណ្ណោះ។</span>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                            <button disabled={isLoading} type="submit" className="bg-[#2ba041] hover:bg-[#238535] disabled:opacity-50 text-white px-8 py-2.5 rounded text-[13px] font-bold shadow-sm transition-colors flex items-center gap-2">
                                {isLoading ? <span className="animate-pulse">កំពុងរក្សាទុក...</span> : <><Save className="w-4 h-4" /> រក្សាទុក</>}
                            </button>
                            
                            <button type="button" onClick={downloadTemplate} className="bg-[#2653e7] hover:bg-[#1d40b8] text-white px-6 py-2.5 rounded text-[13px] font-bold flex items-center gap-2 shadow-sm transition-colors cursor-pointer">
                                <Download className="w-4 h-4" /> <span>ទាញយកគំរូ Excel</span>
                            </button>

                            <label className="bg-[#df4b06] hover:bg-[#bd3f04] text-white px-6 py-2.5 rounded text-[13px] font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-2">
                                <FileSpreadsheet className="w-4 h-4" /> <span>នាំចូលឯកសារ Excel (.xlsx, .csv)</span>
                                <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleExcelImport} />
                            </label>
                        </div>
                    </div>
                </form>
            </div>

            {/* Avatar Modal */}
            {showAvatarModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-2xl mx-4">
                        <div className="flex justify-between items-center border-b dark:border-gray-700 pb-4 mb-4">
                            <h3 className="kh-moul text-indigo-800 dark:text-indigo-300 text-sm flex items-center gap-2">
                                <Smile className="w-5 h-5" /> ជ្រើសរើសរូបតុក្កតាតំណាង (Avatar)
                            </h3>
                            <button onClick={() => setShowAvatarModal(false)} className="text-gray-500 hover:text-red-500 text-xl font-bold">&times;</button>
                        </div>
                        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-[60vh] overflow-y-auto p-2 bg-gray-50 dark:bg-gray-900 rounded border dark:border-gray-700">
                            {/* Example seeds */}
                            {[1,3,6,9,10,13,15,17,18,19,20,23,29,52,54,58,59,64,65,68,74,75,84].map(seed => (
                                <div key={`notionists-${seed}`} onClick={() => selectAvatar(seed, 'notionists')} className="cursor-pointer border-2 border-transparent hover:border-indigo-500 rounded p-1 bg-white dark:bg-gray-800 transition">
                                    <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}`} alt="avatar" />
                                </div>
                            ))}
                        </div>
                        <div className="mt-6 flex justify-end">
                            <button onClick={() => setShowAvatarModal(false)} className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white px-6 py-2 rounded font-bold text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition">បិទ</button>
                        </div>
                    </div>
                </div>
            )}

            {/* URL Modal */}
            {showUrlModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-2xl w-96 mx-4">
                        <h3 className="kh-moul text-sm text-indigo-800 dark:text-indigo-300 mb-3">បញ្ចូល Link រូបភាព</h3>
                        <input id="urlInput" type="text" className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-3 py-2 text-sm mb-4 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="https://drive.google.com/..." />
                        <div className="flex gap-2">
                            <button onClick={() => applyUrlPhoto((document.getElementById('urlInput') as HTMLInputElement).value)} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded font-bold text-sm transition">យល់ព្រម</button>
                            <button onClick={() => setShowUrlModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white text-gray-700 py-2 rounded font-bold text-sm transition">បោះបង់</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
