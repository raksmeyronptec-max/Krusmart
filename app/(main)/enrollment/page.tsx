'use client'

import { useEffect, useRef, useState, useReducer } from 'react'
import { useRouter } from 'next/navigation'
import {
  Award, CheckCircle2, Download, FileText, Home, Info,
  MapPin, Save, Upload, UserPlus, Users, RotateCcw
} from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx-js-style'
import { Button } from '@/components/ui/actions/Button'
import Select from '@/components/ui/forms/Select'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { getErrorMessage } from '@/lib/utils/errors'
import { logger } from '@/lib/utils/logger'
import { calculateAge } from '@/lib/utils/date'
import type { SheetImportRow } from '@/lib/utils/xlsx'
import { createStudent, importStudents } from './actions'

import {
  initialState,
  enrollmentReducer,
  useAutoSave,
  useBeforeUnload,
  type EnrollmentState,
  type EnrollmentTextField
} from './reducer'
import {
  TextField,
  EnrollmentSection,
  PhotoUploader,
  AvatarPickerModal,
} from './components'

const YES_NO = ['ទេ', 'បាទ/ចាស']

type LocationTree = Record<string, Record<string, Record<string, string[]>>>

const SECTIONS = [
  { id: 'student-details', label: 'ព័ត៌មានសិស្ស' },
  { id: 'addresses', label: 'អាសយដ្ឋាន' },
  { id: 'student-status', label: 'ស្ថានភាព' },
  { id: 'guardians', label: 'អាណាព្យាបាល' },
  { id: 'additional-details', label: 'បន្ថែម' },
]

export default function EnrollmentPage() {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const [state, dispatch] = useReducer(enrollmentReducer, initialState)
  const [isSaving, setIsSaving] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [showAvatarModal, setShowAvatarModal] = useState(false)
  const [activeSection, setActiveSection] = useState('student-details')
  const [globalError, setGlobalError] = useState<string | null>(null)

  // Location data
  const [locations, setLocations] = useState<LocationTree | null>(null)
  const [locationsLoading, setLocationsLoading] = useState(true)

  // Load locations
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

  // Restore draft
  useEffect(() => {
    const draft = localStorage.getItem('krusmart_enrollment_draft')
    if (draft) {
      try {
        const parsed = JSON.parse(draft)
        dispatch({ type: 'RESTORE_DRAFT', state: parsed })
        toast.success('បានទាញយកទិន្នន័យព្រាងមកវិញ។')
      } catch (e) {
        // ignore
      }
    }
  }, [])

  // Hooks
  useAutoSave(state, 'krusmart_enrollment_draft', !isSaving)
  useBeforeUnload(true)

  // Scroll spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id)
        })
      },
      { rootMargin: '-20% 0px -80% 0px' }
    )
    const sections = document.querySelectorAll('section[id]')
    sections.forEach((s) => observer.observe(s))
    return () => sections.forEach((s) => observer.unobserve(s))
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    dispatch({ type: 'SET_FIELD', field: e.target.name as EnrollmentTextField, value: e.target.value })
  }

  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    dispatch({ type: 'SET_FIELD', field: 'dob', value })
    const calcAge = value ? calculateAge(value) : null
    dispatch({ type: 'SET_FIELD', field: 'calculatedAge', value: calcAge !== null && calcAge >= 0 ? calcAge.toString() : '' })
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.required && !e.target.value.trim()) {
      dispatch({ type: 'SET_ERROR', field: e.target.name, error: 'វាលនេះត្រូវការបំពេញ' })
    }
  }

  const validateForm = () => {
    let isValid = true
    const requiredFields = ['studentId', 'grade', 'studentName', 'gender', 'dob']
    requiredFields.forEach((field) => {
      if (!state[field as keyof EnrollmentState]) {
        dispatch({ type: 'SET_ERROR', field, error: 'វាលនេះត្រូវការបំពេញ' })
        isValid = false
      }
    })
    return isValid
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    
    if (!validateForm()) {
      setGlobalError('សូមបំពេញព័ត៌មានចាំបាច់ (មានសញ្ញា *) ទាំងអស់។')
      // Scroll to top or first error
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    
    if (!formRef.current) return

    setIsSaving(true)
    setGlobalError(null)

    try {
      const formData = new FormData(formRef.current)
      formData.append('photoUrl', state.photoUrl)
      
      // If sameAsBirth is checked, location fields might be disabled and omitted from FormData.
      // Explicitly append them from state to ensure backend receives them.
      if (state.sameAsBirth) {
        formData.set('currProvince', state.birthProvince)
        formData.set('currDistrict', state.birthDistrict)
        formData.set('currCommune', state.birthCommune)
        formData.set('currVillage', state.birthVillage)
      }

      const result = await createStudent(formData)

      if (result?.error) {
        setGlobalError(result.error)
        return
      }

      toast.success('បានរក្សាទុកព័ត៌មានសិស្សដោយជោគជ័យ។')
      localStorage.removeItem('krusmart_enrollment_draft')
      router.push('/student-list')
    } catch (submitError: unknown) {
      setGlobalError(`មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ៖ ${getErrorMessage(submitError)}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    if (confirm('តើអ្នកពិតជាចង់សម្អាតទិន្នន័យទាំងអស់មែនទេ?')) {
      dispatch({ type: 'RESET' })
      localStorage.removeItem('krusmart_enrollment_draft')
      setGlobalError(null)
    }
  }

  const downloadTemplate = () => {
    const link = document.createElement('a')
    link.href = '/sample_data.xlsx'
    link.download = 'sample_data.xlsx'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('កំពុងទាញយកគំរូ Excel។')
  }

  const handleExcelImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setGlobalError(null)

    try {
      let jsonData: SheetImportRow[] = []

      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text()
        const lines = text.split('\n').filter((line) => line.trim().length > 0)
        if (lines.length > 0) {
          const separator = lines[0].includes(';') ? ';' : ','
          jsonData = lines.map((line) =>
            line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, '')),
          )
        }
      } else {
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data)
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        jsonData = XLSX.utils.sheet_to_json<SheetImportRow>(worksheet, { header: 1 })
      }

      if (jsonData.length <= 1) {
        toast.error('គ្មានទិន្នន័យសម្រាប់បញ្ចូលទេ។')
        return
      }

      const rows = jsonData.slice(1)
      const students = rows
        .filter((row) => row.length > 0 && row[0])
        .map((row) => {
          const rawDob = row[5]
          let dobStr = ''
          if (typeof rawDob === 'number') {
            const date = new Date(Math.round((rawDob - 25569) * 86400 * 1000))
            dobStr = date.toISOString().split('T')[0]
          } else if (typeof rawDob === 'string') {
            dobStr = rawDob.trim()
            if (dobStr.includes('-')) {
              const parts = dobStr.split('-')
              if (parts.length === 3 && parts[0].length === 2) {
                dobStr = `${parts[2]}-${parts[1]}-${parts[0]}`
              }
            }
          }

          let poorStatus = 'គ្មាន'
          if (row[19] && row[19].toString().trim() !== '') poorStatus = 'ក្រ១'
          else if (row[20] && row[20].toString().trim() !== '') poorStatus = 'ក្រ២'

          let orphanStatus = 'ទេ'
          if (row[17] && row[17].toString().trim() !== '') {
            const orphanValue = row[17].toString().trim()
            if (orphanValue.includes('ទាំងពីរ')) orphanStatus = 'កំព្រាទាំងពីរ'
            else if (orphanValue.includes('ម្តាយ')) orphanStatus = 'កំព្រាម្តាយ'
            else if (orphanValue.includes('ឪពុក')) orphanStatus = 'កំព្រាឪពុក'
            else orphanStatus = 'កំព្រាទាំងពីរ'
          }

          return {
            student_id: row[0]?.toString() || '',
            grade: row[1]?.toString() || '',
            name_kh: row[2]?.toString() || '',
            name_latin: row[3]?.toString() || '',
            gender: row[4]?.toString() || '',
            dob: dobStr,
            phone: row[6]?.toString() || '',
            birth_province: row[7]?.toString() || '',
            birth_district: row[8]?.toString() || '',
            birth_commune: row[9]?.toString() || '',
            birth_village: row[10]?.toString() || '',
            curr_province: row[11]?.toString() || '',
            curr_district: row[12]?.toString() || '',
            curr_commune: row[13]?.toString() || '',
            curr_village: row[14]?.toString() || '',
            is_new_student: Boolean(row[15] && row[15].toString().trim() !== ''),
            is_repeater: Boolean(row[16] && row[16].toString().trim() !== ''),
            orphan_status: orphanStatus,
            is_disabled: Boolean(row[18] && row[18].toString().trim() !== ''),
            poor_status: poorStatus,
            is_equity: Boolean(row[21] && row[21].toString().trim() !== ''),
            is_scholarship: Boolean(row[22] && row[22].toString().trim() !== ''),
            father_name: row[23]?.toString() || '',
            father_job: row[24]?.toString() || '',
            mother_name: row[25]?.toString() || '',
            mother_job: row[26]?.toString() || '',
            guardian_name: row[27]?.toString() || '',
            guardian_job: row[28]?.toString() || '',
            ethnicity: row[29]?.toString() || '',
            special_features: row[30]?.toString() || '',
            other_remarks: row[31]?.toString() || '',
            photo_url: row[32]?.toString() || '',
          }
        })

      if (students.length === 0) {
        toast.error('រកមិនឃើញជួរទិន្នន័យសិស្សក្នុងឯកសារនេះទេ។')
        return
      }

      const result = await importStudents(students)
      if (result?.error) {
        setGlobalError(result.error)
        return
      }

      toast.success(`បានបញ្ចូលព័ត៌មានសិស្ស ${students.length} នាក់ដោយជោគជ័យ។`)
      router.push('/student-list')
    } catch (importError: unknown) {
      setGlobalError(`មានបញ្ហាក្នុងការអានឯកសារ Excel៖ ${getErrorMessage(importError)}`)
    } finally {
      setIsImporting(false)
      event.target.value = ''
    }
  }

  // Location Cascade logic
  const provinceOptions = locations ? Object.keys(locations) : []
  const birthDistrictOptions = Object.keys(locations?.[state.birthProvince] ?? {})
  const birthCommuneOptions = Object.keys(locations?.[state.birthProvince]?.[state.birthDistrict] ?? {})
  const birthVillageOptions = locations?.[state.birthProvince]?.[state.birthDistrict]?.[state.birthCommune] ?? []
  
  const currDistrictOptions = Object.keys(locations?.[state.currProvince] ?? {})
  const currCommuneOptions = Object.keys(locations?.[state.currProvince]?.[state.currDistrict] ?? {})
  const currVillageOptions = locations?.[state.currProvince]?.[state.currDistrict]?.[state.currCommune] ?? []

  const isWorking = isSaving || isImporting

  return (
    <main className="min-h-screen bg-bg-app pb-28 pt-4 transition-colors sm:pt-6 relative">
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 flex flex-col lg:flex-row gap-6">
        
        {/* Left Sidebar (Desktop) */}
        <div className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-6">
            <h2 className="kh-moul text-lg text-text-heading mb-4">ចុះឈ្មោះសិស្សថ្មី</h2>
            <nav className="flex flex-col gap-2 relative border-l-2 border-divider ml-2 pl-4">
              {SECTIONS.map((section, index) => {
                const isActive = activeSection === section.id
                return (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className={`relative py-2 text-sm font-bold transition-colors flex items-center justify-between ${
                      isActive ? 'text-brand' : 'text-text-muted hover:text-text-heading'
                    }`}
                  >
                    {/* Active indicator dot on the border line */}
                    {isActive && (
                      <span className="absolute -left-[21px] top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-bg-app" />
                    )}
                    <span>{section.label}</span>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                      isActive ? 'bg-brand/10 text-brand' : 'bg-paper text-text-muted'
                    }`}>
                      {index + 1}
                    </span>
                  </a>
                )
              })}
            </nav>
            <div className="mt-8 space-y-3">
              <Button type="button" variant="secondary" className="w-full justify-start" icon={<RotateCcw className="h-4 w-4" />} onClick={handleReset}>
                សម្អាតទិន្នន័យ
              </Button>
              <Button type="button" variant="secondary" className="w-full justify-start" icon={<Download className="h-4 w-4" />} onClick={downloadTemplate}>
                ទាញយកគំរូ Excel
              </Button>
              <Button type="button" variant="secondary" className="w-full justify-start border-warning/50 text-warning hover:bg-warning/10 hover:border-warning" loading={isImporting} icon={<Upload className="h-4 w-4" />} onClick={() => importInputRef.current?.click()}>
                នាំចូល Excel / CSV
              </Button>
              <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={handleExcelImport} />
            </div>
          </div>
        </div>

        {/* Mobile Stepper */}
        <div className="lg:hidden sticky top-0 z-30 -mx-4 px-4 bg-bg-app/80 backdrop-blur pb-4 pt-2">
          <nav aria-label="ផ្នែកនៃការចុះឈ្មោះ" className="flex gap-2 overflow-x-auto hide-scrollbar">
            {SECTIONS.map((section, index) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                  activeSection === section.id 
                    ? 'border-brand bg-brand/10 text-brand' 
                    : 'border-divider bg-paper text-text-body hover:border-brand/50'
                }`}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                  activeSection === section.id ? 'bg-bg-surface text-brand' : 'bg-bg-surface text-text-muted'
                }`}>
                  {index + 1}
                </span>
                {section.label}
              </a>
            ))}
          </nav>
        </div>

        {/* Main Form Content */}
        <div className="flex-1 min-w-0">
          <form ref={formRef} onSubmit={handleSubmit} noValidate>
            {globalError && (
              <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger shadow-sm">
                <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-extrabold">មិនអាចរក្សាទុកបានទេ</p>
                  <p className="mt-1 leading-6">{globalError}</p>
                </div>
              </div>
            )}

            <EnrollmentSection id="student-details" number="1" title="ព័ត៌មានសិស្ស" description="ព័ត៌មានមានសញ្ញា * គឺចាំបាច់សម្រាប់បង្កើតកំណត់ត្រាសិស្ស។" icon={UserPlus}>
              <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
                <aside className="flex flex-col gap-2">
                  <p className="text-sm font-extrabold text-text-heading">រូបតំណាង</p>
                  <PhotoUploader 
                    photoUrl={state.photoUrl} 
                    onPhotoChange={(url) => dispatch({ type: 'SET_FIELD', field: 'photoUrl', value: url })} 
                    onOpenAvatarModal={() => setShowAvatarModal(true)} 
                  />
                </aside>

                <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                  <TextField label="អត្តលេខ" name="studentId" required placeholder="ឧ. 2026-001" value={state.studentId} onChange={handleChange} onBlur={handleBlur} error={state.errors.studentId} />
                  <TextField label="ថ្នាក់ទី" name="grade" required placeholder="ឧ. ១ក" value={state.grade} onChange={handleChange} onBlur={handleBlur} error={state.errors.grade} />
                  <TextField label="ឈ្មោះសិស្ស (ខ្មែរ)" name="studentName" required placeholder="គោត្តនាម និងនាម" value={state.studentName} onChange={handleChange} onBlur={handleBlur} error={state.errors.studentName} />
                  <TextField label="ឈ្មោះអក្សរឡាតាំង" name="latinName" placeholder="Latin name" value={state.latinName} onChange={handleChange} />
                  
                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-text-body">ភេទ<span className="ml-1 text-danger">*</span></label>
                    <Select name="gender" required placeholder="ជ្រើសរើសភេទ" options={['ប្រុស', 'ស្រី']} value={state.gender} onChange={(val) => { dispatch({ type: 'SET_FIELD', field: 'gender', value: val }); dispatch({ type: 'CLEAR_ERROR', field: 'gender' }) }} />
                    {state.errors.gender && <p className="mt-1.5 text-xs font-bold text-danger">{state.errors.gender}</p>}
                  </div>

                  <TextField label="ថ្ងៃខែឆ្នាំកំណើត" name="dob" required type="date" value={state.dob} onChange={handleDobChange} onBlur={handleBlur} error={state.errors.dob} />
                  <TextField label="អាយុ (ឆ្នាំ)" name="calculatedAge" value={state.calculatedAge} readOnly placeholder="គណនាស្វ័យប្រវត្តិ" className="bg-paper font-bold text-text-muted" hint="គណនាតាមថ្ងៃខែឆ្នាំកំណើត" />
                  <TextField label="លេខទូរស័ព្ទ" name="phone" type="tel" placeholder="ឧ. ០១២ ៣៤៥ ៦៧៨" value={state.phone} onChange={handleChange} wrapperClassName="sm:col-span-2" />
                </div>
              </div>
            </EnrollmentSection>

            <EnrollmentSection id="addresses" number="2" title="ព័ត៌មានទីតាំង និងអាសយដ្ឋាន" description="ជ្រើសរើសតាមលំដាប់ រាជធានី/ខេត្ត → ក្រុង/ស្រុក/ខណ្ឌ → ឃុំ/សង្កាត់ → ភូមិ។" icon={MapPin}>
              <div className="grid gap-5 xl:grid-cols-2 relative">
                {/* Birth Address */}
                <div className="rounded-xl border border-divider bg-paper p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success"><MapPin className="h-4 w-4" /></span>
                    <div>
                      <h3 className="font-extrabold text-text-heading">ទីកន្លែងកំណើត</h3>
                      <p className="text-xs text-text-muted">អាសយដ្ឋាននៅពេលកំណើត</p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-bold text-text-body">រាជធានី/ខេត្ត</label>
                      <SearchableSelect name="birthProvince" placeholder="ជ្រើសរើសខេត្ត" options={provinceOptions} value={state.birthProvince} loading={locationsLoading} clearable onChange={(val) => { dispatch({ type: 'SET_FIELD', field: 'birthProvince', value: val }); dispatch({ type: 'SET_FIELD', field: 'birthDistrict', value: '' }); dispatch({ type: 'SET_FIELD', field: 'birthCommune', value: '' }); dispatch({ type: 'SET_FIELD', field: 'birthVillage', value: '' }) }} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-bold text-text-body">ក្រុង/ស្រុក/ខណ្ឌ</label>
                      <SearchableSelect name="birthDistrict" placeholder="ជ្រើសរើសក្រុង/ស្រុក" options={birthDistrictOptions} value={state.birthDistrict} disabled={!state.birthProvince} clearable onChange={(val) => { dispatch({ type: 'SET_FIELD', field: 'birthDistrict', value: val }); dispatch({ type: 'SET_FIELD', field: 'birthCommune', value: '' }); dispatch({ type: 'SET_FIELD', field: 'birthVillage', value: '' }) }} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-bold text-text-body">ឃុំ/សង្កាត់</label>
                      <SearchableSelect name="birthCommune" placeholder="ជ្រើសរើសឃុំ/សង្កាត់" options={birthCommuneOptions} value={state.birthCommune} disabled={!state.birthDistrict} clearable onChange={(val) => { dispatch({ type: 'SET_FIELD', field: 'birthCommune', value: val }); dispatch({ type: 'SET_FIELD', field: 'birthVillage', value: '' }) }} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-bold text-text-body">ភូមិ</label>
                      <SearchableSelect name="birthVillage" placeholder="ជ្រើសរើសភូមិ" options={birthVillageOptions} value={state.birthVillage} disabled={!state.birthCommune} clearable onChange={(val) => dispatch({ type: 'SET_FIELD', field: 'birthVillage', value: val })} />
                    </div>
                  </div>
                </div>

                {/* Current Address */}
                <div className={`rounded-xl border p-4 transition-colors ${state.sameAsBirth ? 'border-success/50 bg-success/5' : 'border-divider bg-paper'}`}>
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${state.sameAsBirth ? 'bg-success/20 text-success' : 'bg-brand/10 text-brand'}`}><Home className="h-4 w-4" /></span>
                      <div>
                        <h3 className="font-extrabold text-text-heading flex items-center gap-2">
                          អាសយដ្ឋានសព្វថ្ងៃ
                          {state.sameAsBirth && <span className="text-[10px] font-bold bg-success text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider">បានភ្ជាប់</span>}
                        </h3>
                        <p className="text-xs text-text-muted">ទីលំនៅបច្ចុប្បន្នរបស់សិស្ស</p>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-text-heading hover:text-brand">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded border-divider text-brand focus:ring-brand accent-brand" 
                        checked={state.sameAsBirth} 
                        onChange={(e) => {
                          if (e.target.checked) dispatch({ type: 'COPY_ADDRESS' })
                          else dispatch({ type: 'SET_FLAG', field: 'sameAsBirth', value: false })
                        }} 
                      />
                      ដូចទីកន្លែងកំណើត
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 relative">
                    {state.sameAsBirth && <div className="absolute inset-0 z-10 bg-transparent" title="បានភ្ជាប់ជាមួយទីកន្លែងកំណើត" />}
                    <div className={state.sameAsBirth ? 'opacity-60' : ''}>
                      <label className="mb-1.5 block text-sm font-bold text-text-body">រាជធានី/ខេត្ត</label>
                      <SearchableSelect name="currProvince" placeholder="ជ្រើសរើសខេត្ត" options={provinceOptions} value={state.currProvince} loading={locationsLoading} clearable onChange={(val) => { dispatch({ type: 'SET_FIELD', field: 'currProvince', value: val }); dispatch({ type: 'SET_FIELD', field: 'currDistrict', value: '' }); dispatch({ type: 'SET_FIELD', field: 'currCommune', value: '' }); dispatch({ type: 'SET_FIELD', field: 'currVillage', value: '' }) }} />
                    </div>
                    <div className={state.sameAsBirth ? 'opacity-60' : ''}>
                      <label className="mb-1.5 block text-sm font-bold text-text-body">ក្រុង/ស្រុក/ខណ្ឌ</label>
                      <SearchableSelect name="currDistrict" placeholder="ជ្រើសរើសក្រុង/ស្រុក" options={currDistrictOptions} value={state.currDistrict} disabled={!state.currProvince} clearable onChange={(val) => { dispatch({ type: 'SET_FIELD', field: 'currDistrict', value: val }); dispatch({ type: 'SET_FIELD', field: 'currCommune', value: '' }); dispatch({ type: 'SET_FIELD', field: 'currVillage', value: '' }) }} />
                    </div>
                    <div className={state.sameAsBirth ? 'opacity-60' : ''}>
                      <label className="mb-1.5 block text-sm font-bold text-text-body">ឃុំ/សង្កាត់</label>
                      <SearchableSelect name="currCommune" placeholder="ជ្រើសរើសឃុំ/សង្កាត់" options={currCommuneOptions} value={state.currCommune} disabled={!state.currDistrict} clearable onChange={(val) => { dispatch({ type: 'SET_FIELD', field: 'currCommune', value: val }); dispatch({ type: 'SET_FIELD', field: 'currVillage', value: '' }) }} />
                    </div>
                    <div className={state.sameAsBirth ? 'opacity-60' : ''}>
                      <label className="mb-1.5 block text-sm font-bold text-text-body">ភូមិ</label>
                      <SearchableSelect name="currVillage" placeholder="ជ្រើសរើសភូមិ" options={currVillageOptions} value={state.currVillage} disabled={!state.currCommune} clearable onChange={(val) => dispatch({ type: 'SET_FIELD', field: 'currVillage', value: val })} />
                    </div>
                  </div>
                </div>
              </div>
            </EnrollmentSection>

            <EnrollmentSection id="student-status" number="3" title="ស្ថានភាព និងអាហារូបករណ៍" description="កំណត់ស្ថានភាពសិស្ស ដើម្បីប្រើក្នុងរបាយការណ៍ និងការគាំទ្រ។" icon={Award}>
              <div className="grid gap-4 md:grid-cols-3">
                {/* Academic */}
                <div className="rounded-xl border-l-4 border-l-brand bg-brand/5 p-4 border border-divider">
                  <h4 className="font-bold text-brand mb-3">ការសិក្សា</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-text-body">សិស្សថ្មី</label>
                      <Select name="isNewStudent" options={YES_NO} value={state.isNewStudent} onChange={(val) => dispatch({ type: 'SET_FIELD', field: 'isNewStudent', value: val })} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-text-body">សិស្សត្រួតថ្នាក់</label>
                      <Select name="isRepeater" options={YES_NO} value={state.isRepeater} onChange={(val) => dispatch({ type: 'SET_FIELD', field: 'isRepeater', value: val })} />
                    </div>
                  </div>
                </div>
                
                {/* Social */}
                <div className="rounded-xl border-l-4 border-l-warning bg-warning/5 p-4 border border-divider">
                  <h4 className="font-bold text-warning mb-3">ស្ថានភាពសង្គម</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-text-body">ស្ថានភាពគ្រួសារ</label>
                      <Select name="orphanStatus" options={['ទេ', 'កំព្រាឪពុក', 'កំព្រាម្តាយ', 'កំព្រាទាំងពីរ']} value={state.orphanStatus} onChange={(val) => dispatch({ type: 'SET_FIELD', field: 'orphanStatus', value: val })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-text-body">ពិការភាព</label>
                        <Select name="isDisabled" options={YES_NO} value={state.isDisabled} onChange={(val) => dispatch({ type: 'SET_FIELD', field: 'isDisabled', value: val })} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-text-body">ប័ណ្ណក្រីក្រ</label>
                        <Select name="poorStatus" options={['គ្មាន', 'ក្រ១', 'ក្រ២']} value={state.poorStatus} onChange={(val) => dispatch({ type: 'SET_FIELD', field: 'poorStatus', value: val })} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Support */}
                <div className="rounded-xl border-l-4 border-l-success bg-success/5 p-4 border border-divider">
                  <h4 className="font-bold text-success mb-3">ការគាំទ្រ</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-text-body">សិស្សសមធម៌</label>
                      <Select name="isEquity" options={YES_NO} value={state.isEquity} onChange={(val) => dispatch({ type: 'SET_FIELD', field: 'isEquity', value: val })} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-text-body">អាហារូបករណ៍</label>
                      <Select name="isScholarship" options={YES_NO} value={state.isScholarship} onChange={(val) => dispatch({ type: 'SET_FIELD', field: 'isScholarship', value: val })} />
                    </div>
                  </div>
                </div>
              </div>
            </EnrollmentSection>

            <EnrollmentSection id="guardians" number="4" title="ព័ត៌មានអាណាព្យាបាល" description="បញ្ចូលព័ត៌មានទំនាក់ទំនងរបស់ឪពុកម្តាយ ឬអាណាព្យាបាល។" icon={Users}>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="group rounded-xl border border-divider bg-paper p-4 hover:shadow-md transition-shadow">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand font-extrabold text-xs">ឪ</span>
                    <p className="text-sm font-extrabold text-text-heading">ឪពុក</p>
                  </div>
                  <div className="grid gap-4">
                    <TextField label="ឈ្មោះឪពុក" name="fatherName" placeholder="ឈ្មោះពេញ" value={state.fatherName} onChange={handleChange} />
                    <TextField label="មុខរបរ" name="fatherJob" placeholder="មុខរបរ" value={state.fatherJob} onChange={handleChange} />
                  </div>
                </div>
                <div className="group rounded-xl border border-divider bg-paper p-4 hover:shadow-md transition-shadow">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-success/10 text-success font-extrabold text-xs">ម</span>
                    <p className="text-sm font-extrabold text-text-heading">ម្តាយ</p>
                  </div>
                  <div className="grid gap-4">
                    <TextField label="ឈ្មោះម្តាយ" name="motherName" placeholder="ឈ្មោះពេញ" value={state.motherName} onChange={handleChange} />
                    <TextField label="មុខរបរ" name="motherJob" placeholder="មុខរបរ" value={state.motherJob} onChange={handleChange} />
                  </div>
                </div>
                <div className="group rounded-xl border border-divider bg-paper p-4 hover:shadow-md transition-shadow relative">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-warning/10 text-warning font-extrabold text-xs">អ</span>
                      <p className="text-sm font-extrabold text-text-heading">អាណាព្យាបាល</p>
                    </div>
                    <button 
                      type="button" 
                      className="text-xs font-bold text-brand hover:underline"
                      onClick={() => dispatch({ type: 'COPY_FATHER_TO_GUARDIAN' })}
                    >
                      ដូចឪពុក
                    </button>
                  </div>
                  <div className="grid gap-4">
                    <TextField label="ឈ្មោះអាណាព្យាបាល" name="guardianName" placeholder="ឈ្មោះពេញ" value={state.guardianName} onChange={handleChange} />
                    <TextField label="មុខរបរ" name="guardianJob" placeholder="មុខរបរ" value={state.guardianJob} onChange={handleChange} />
                  </div>
                </div>
              </div>
            </EnrollmentSection>

            <EnrollmentSection id="additional-details" number="5" title="ព័ត៌មានបន្ថែម" description="ព័ត៌មាននេះមិនចាំបាច់ទេ ប៉ុន្តែអាចជួយគាំទ្រការតាមដានសិស្ស។" icon={FileText}>
              <div className="grid gap-x-5 gap-y-4 md:grid-cols-3">
                <TextField label="ជនជាតិដើមភាគតិច" name="ethnicity" placeholder="ឧ. ព្នង, គួយ" value={state.ethnicity} onChange={handleChange} />
                <TextField label="លក្ខណៈពិសេស" name="specialFeatures" placeholder="លក្ខណៈផ្សេងៗ" value={state.specialFeatures} onChange={handleChange} />
                <TextField label="សេចក្តីផ្សេងៗ" name="otherRemarks" placeholder="ព័ត៌មានបន្ថែម" value={state.otherRemarks} onChange={handleChange} />
              </div>
            </EnrollmentSection>

            {/* Sticky Footer */}
            <div className="sticky bottom-0 z-40 -mx-4 px-4 pb-4 pt-2 sm:mx-0 sm:px-0">
              <div className="rounded-2xl border border-divider bg-bg-surface/95 p-3 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] backdrop-blur-xl sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
                    <span>ពិនិត្យព័ត៌មានមុនពេលរក្សាទុក</span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="button" variant="secondary" disabled={isWorking} onClick={() => router.push('/student-list')}>
                      បោះបង់
                    </Button>
                    <Button type="submit" variant="success" loading={isSaving} disabled={isImporting} icon={<Save className="h-4 w-4" />}>
                      រក្សាទុកព័ត៌មានសិស្ស
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>

      <AvatarPickerModal 
        isOpen={showAvatarModal} 
        onClose={() => setShowAvatarModal(false)} 
        onSelect={(url) => dispatch({ type: 'SET_FIELD', field: 'photoUrl', value: url })} 
      />
    </main>
  )
}
