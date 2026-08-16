'use client'

import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Button } from '@/components/ui/actions/Button'
import { useRouter } from 'next/navigation'
import {
  Award,
  Camera,
  CheckCircle2,
  Download,
  FileText,
  Home,
  Image as ImageIcon,
  Info,
  Link2,
  List,
  MapPin,
  Save,
  Smile,
  Upload,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx-js-style'
import { createStudent, importStudents } from './actions'
import Select from '@/components/ui/forms/Select'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { getErrorMessage } from '@/lib/utils/errors'
import { logger } from '@/lib/utils/logger'
import { calculateAge } from '@/lib/utils/date'
import type { SheetImportRow } from '@/lib/utils/xlsx'

/** province → district → commune → villages[] */
type LocationTree = Record<string, Record<string, Record<string, string[]>>>

type SectionProps = {
  number: string
  title: string
  description: string
  icon: LucideIcon
  children: ReactNode
  id: string
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  wrapperClassName?: string
}

const YES_NO = ['ទេ', 'បាទ/ចាស']

const inputClassName = [
  'min-h-11 w-full rounded-xl border border-divider bg-bg-surface px-3.5 py-2.5 text-[16px] text-text-heading',
  'placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus-ring/30',
  'disabled:cursor-not-allowed disabled:bg-paper disabled:text-text-muted',
  'dark:bg-bg-surface dark:text-text-heading',
].join(' ')

function EnrollmentSection({ number, title, description, icon: Icon, children, id }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm sm:p-6">
      <header className="mb-5 flex items-start gap-3 border-b border-divider pb-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-extrabold text-brand-contrast shadow-sm">
          {number}
        </span>
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-extrabold text-text-heading">{title}</h2>
          <p className="mt-0.5 text-sm leading-6 text-text-muted">{description}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

function TextField({
  label,
  hint,
  wrapperClassName = '',
  className = '',
  id,
  name,
  required,
  ...props
}: TextFieldProps) {
  const fieldId = id ?? name

  return (
    <div className={wrapperClassName}>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-bold text-text-body">
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </label>
      <input id={fieldId} name={name} required={required} className={`${inputClassName} ${className}`} {...props} />
      {hint && <p className="mt-1.5 text-xs leading-5 text-text-muted">{hint}</p>}
    </div>
  )
}

function LocationField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-text-body">{label}</p>
      {children}
    </div>
  )
}

export default function EnrollmentPage() {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoUrlInput, setPhotoUrlInput] = useState('')
  const [showAvatarModal, setShowAvatarModal] = useState(false)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [dob, setDob] = useState('')
  const [age, setAge] = useState('')

  // Location data
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
  const importInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

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

  // Cascade option lists. Every level is defensive: an unmatched parent is an
  // empty list rather than a broken form.
  const provinceOptions = locations ? Object.keys(locations) : []
  const birthDistrictOptions = Object.keys(locations?.[birthProv] ?? {})
  const birthCommuneOptions = Object.keys(locations?.[birthProv]?.[birthDist] ?? {})
  const birthVillageOptions = locations?.[birthProv]?.[birthDist]?.[birthComm] ?? []
  const currDistrictOptions = Object.keys(locations?.[currProv] ?? {})
  const currCommuneOptions = Object.keys(locations?.[currProv]?.[currDist] ?? {})
  const currVillageOptions = locations?.[currProv]?.[currDist]?.[currComm] ?? []
  const isWorking = isSaving || isImporting

  const handleDobChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setDob(value)
    const calculatedAge = value ? calculateAge(value) : null
    setAge(calculatedAge !== null && calculatedAge >= 0 ? calculatedAge.toString() : '')
  }

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('ទំហំរូបថតធំពេក។ សូមជ្រើសរើសរូបដែលតូចជាង 5MB។')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (loadEvent) => setPhotoUrl(loadEvent.target?.result as string)
    reader.readAsDataURL(file)
  }

  const applyUrlPhoto = () => {
    let finalUrl = photoUrlInput.trim()
    if (!finalUrl) {
      toast.error('សូមបញ្ចូលតំណភ្ជាប់រូបភាពជាមុនសិន។')
      return
    }

    if (finalUrl.includes('drive.google.com')) {
      const matchFileD = finalUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
      const matchId = finalUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/)
      const fileId = matchFileD ? matchFileD[1] : matchId ? matchId[1] : null
      if (fileId) finalUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`
    }

    setPhotoUrl(finalUrl)
    setPhotoUrlInput('')
    setShowUrlModal(false)
    toast.success('បានកំណត់រូបតំណាងរួចរាល់។')
  }

  const selectAvatar = (seed: number, group: string) => {
    setPhotoUrl(`https://api.dicebear.com/7.x/${group}/svg?seed=${seed}`)
    setShowAvatarModal(false)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!formRef.current) return

    setIsSaving(true)
    setError(null)

    try {
      const formData = new FormData(formRef.current)
      formData.append('photoUrl', photoUrl)
      const result = await createStudent(formData)

      if (result?.error) {
        setError(result.error)
        return
      }

      toast.success('បានរក្សាទុកព័ត៌មានសិស្សដោយជោគជ័យ។')
      router.push('/student-list')
    } catch (submitError: unknown) {
      setError(`មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ៖ ${getErrorMessage(submitError)}`)
    } finally {
      setIsSaving(false)
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
    setError(null)

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
          // Date may be DD-MM-YYYY or an Excel serial number. Other input is
          // deliberately blank so server-side validation remains authoritative.
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
        setError(result.error)
        return
      }

      toast.success(`បានបញ្ចូលព័ត៌មានសិស្ស ${students.length} នាក់ដោយជោគជ័យ។`)
      router.push('/student-list')
    } catch (importError: unknown) {
      setError(`មានបញ្ហាក្នុងការអានឯកសារ Excel៖ ${getErrorMessage(importError)}`)
    } finally {
      setIsImporting(false)
      event.target.value = ''
    }
  }

  return (
    <main className="min-h-screen bg-bg-app pb-28 pt-4 transition-colors sm:pt-6">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mb-5 overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
          <div className="h-1.5 bg-gradient-to-r from-brand via-brand to-success" />
          <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-brand-contrast shadow-sm">
                <UserPlus className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand">KruSmart</p>
                <h1 className="kh-moul mt-1 text-xl text-text-heading sm:text-2xl">ចុះឈ្មោះសិស្សថ្មី</h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
                  បំពេញព័ត៌មានសំខាន់ជាមុនសិន ហើយបន្ថែមព័ត៌មានលម្អិតតាមតម្រូវការ។
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              icon={<List className="h-4 w-4" aria-hidden="true" />}
              onClick={() => router.push('/student-list')}
            >
              មើលបញ្ជីសិស្ស
            </Button>
          </div>
          <nav aria-label="ផ្នែកនៃការចុះឈ្មោះ" className="flex gap-2 overflow-x-auto border-t border-divider px-5 py-3 sm:px-6">
            {[
              ['ព័ត៌មានសិស្ស', '#student-details'],
              ['អាសយដ្ឋាន', '#addresses'],
              ['ស្ថានភាព', '#student-status'],
              ['អាណាព្យាបាល', '#guardians'],
              ['បន្ថែម', '#additional-details'],
            ].map(([label, href], index) => (
              <a
                key={href}
                href={href}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-divider bg-paper px-3 py-1.5 text-xs font-bold text-text-body transition-colors hover:border-brand hover:bg-brand/5 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-bg-surface text-[10px] text-text-muted">
                  {index + 1}
                </span>
                {label}
              </a>
            ))}
          </nav>
        </header>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5" noValidate={false}>
          {error && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger shadow-sm">
              <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-extrabold">មិនអាចរក្សាទុកបានទេ</p>
                <p className="mt-1 leading-6">{error}</p>
              </div>
            </div>
          )}

          <EnrollmentSection
            id="student-details"
            number="1"
            title="ព័ត៌មានសិស្ស"
            description="ព័ត៌មានមានសញ្ញា * គឺចាំបាច់សម្រាប់បង្កើតកំណត់ត្រាសិស្ស។"
            icon={UserPlus}
          >
            <div className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
              <aside className="rounded-2xl border border-divider bg-paper p-4 text-center">
                <p className="text-sm font-extrabold text-text-heading">រូបតំណាង</p>
                <button
                  type="button"
                  aria-label="ជ្រើសរើសរូបតំណាងសិស្ស"
                  onClick={() => setShowAvatarModal(true)}
                  className="group relative mx-auto mt-3 flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-brand/50 bg-bg-surface text-brand transition hover:border-brand hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- user-uploaded or remote avatar is previewed before being persisted; next/image does not add value here.
                    <img src={photoUrl} alt="រូបតំណាងសិស្ស" className="h-full w-full object-cover" onError={() => setPhotoUrl('')} />
                  ) : (
                    <span className="flex flex-col items-center gap-2 text-text-muted">
                      <ImageIcon className="h-8 w-8" aria-hidden="true" />
                      <span className="text-xs font-bold">បន្ថែមរូប</span>
                    </span>
                  )}
                  <span className="absolute inset-0 hidden items-center justify-center bg-brand/80 text-xs font-extrabold text-brand-contrast group-hover:flex">
                    កែប្រែរូប
                  </span>
                </button>
                <div className="mt-4 grid gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<Smile className="h-3.5 w-3.5" aria-hidden="true" />}
                    onClick={() => setShowAvatarModal(true)}
                  >
                    ជ្រើសរូបតុក្កតា
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    icon={<Camera className="h-3.5 w-3.5" aria-hidden="true" />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    ផ្ទុករូបឡើង
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    icon={<Link2 className="h-3.5 w-3.5" aria-hidden="true" />}
                    onClick={() => setShowUrlModal(true)}
                  >
                    ប្រើតំណភ្ជាប់
                  </Button>
                </div>
                <p className="mt-3 text-xs leading-5 text-text-muted">អាចប្រើរូបផ្ទាល់ រូបតុក្កតា ឬតំណភ្ជាប់រូបភាព។ ទំហំអតិបរមា 5MB។</p>
                <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handlePhotoUpload} />
              </aside>

              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                <TextField label="អត្តលេខ" name="studentId" required placeholder="ឧ. 2026-001" autoComplete="off" />
                <TextField label="ថ្នាក់ទី" name="grade" required placeholder="ឧ. ១ក" autoComplete="off" />
                <TextField label="ឈ្មោះសិស្ស (ខ្មែរ)" name="studentName" required placeholder="គោត្តនាម និងនាម" autoComplete="name" />
                <TextField label="ឈ្មោះសិស្សជាអក្សរឡាតាំង" name="latinName" placeholder="Latin name" autoComplete="name" />
                <Select name="gender" label="ភេទ" required placeholder="ជ្រើសរើសភេទ" options={['ប្រុស', 'ស្រី']} />
                <TextField label="ថ្ងៃខែឆ្នាំកំណើត" name="dob" required type="date" value={dob} onChange={handleDobChange} />
                <TextField
                  label="អាយុ (ឆ្នាំ)"
                  name="calculatedAge"
                  value={age}
                  readOnly
                  placeholder="គណនាស្វ័យប្រវត្តិ"
                  className="bg-paper font-bold text-text-muted"
                  hint="គណនាតាមថ្ងៃខែឆ្នាំកំណើត"
                />
                <TextField label="លេខទូរស័ព្ទអាណាព្យាបាល" name="phone" type="tel" placeholder="ឧ. ០១២ ៣៤៥ ៦៧៨" wrapperClassName="sm:col-span-2" autoComplete="tel" />
              </div>
            </div>
          </EnrollmentSection>

          <EnrollmentSection
            id="addresses"
            number="2"
            title="ព័ត៌មានទីតាំង និងអាសយដ្ឋាន"
            description="ជ្រើសរើសតាមលំដាប់ រាជធានី/ខេត្ត → ក្រុង/ស្រុក/ខណ្ឌ → ឃុំ/សង្កាត់ → ភូមិ។"
            icon={MapPin}
          >
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="rounded-xl border border-divider bg-paper p-4">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success"><MapPin className="h-4 w-4" aria-hidden="true" /></span>
                  <div>
                    <h3 className="font-extrabold text-text-heading">ទីកន្លែងកំណើត</h3>
                    <p className="text-xs text-text-muted">អាសយដ្ឋាននៅពេលកំណើត</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <LocationField label="រាជធានី/ខេត្ត"><SearchableSelect name="birthProvince" ariaLabel="រាជធានី ឬខេត្តកំណើត" placeholder="ជ្រើសរើសខេត្ត" options={provinceOptions} value={birthProv} loading={locationsLoading} clearable onChange={(value) => { setBirthProv(value); setBirthDist(''); setBirthComm(''); setBirthVill('') }} /></LocationField>
                  <LocationField label="ក្រុង/ស្រុក/ខណ្ឌ"><SearchableSelect name="birthDistrict" ariaLabel="ក្រុង ស្រុក ឬខណ្ឌកំណើត" placeholder="ជ្រើសរើសក្រុង/ស្រុក" options={birthDistrictOptions} value={birthDist} disabled={!birthProv} clearable onChange={(value) => { setBirthDist(value); setBirthComm(''); setBirthVill('') }} /></LocationField>
                  <LocationField label="ឃុំ/សង្កាត់"><SearchableSelect name="birthCommune" ariaLabel="ឃុំ ឬសង្កាត់កំណើត" placeholder="ជ្រើសរើសឃុំ/សង្កាត់" options={birthCommuneOptions} value={birthComm} disabled={!birthDist} clearable onChange={(value) => { setBirthComm(value); setBirthVill('') }} /></LocationField>
                  <LocationField label="ភូមិ"><SearchableSelect name="birthVillage" ariaLabel="ភូមិកំណើត" placeholder="ជ្រើសរើសភូមិ" options={birthVillageOptions} value={birthVill} disabled={!birthComm} clearable onChange={setBirthVill} /></LocationField>
                </div>
              </div>

              <div className="rounded-xl border border-divider bg-paper p-4">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand"><Home className="h-4 w-4" aria-hidden="true" /></span>
                  <div>
                    <h3 className="font-extrabold text-text-heading">អាសយដ្ឋានសព្វថ្ងៃ</h3>
                    <p className="text-xs text-text-muted">ទីលំនៅបច្ចុប្បន្នរបស់សិស្ស</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <LocationField label="រាជធានី/ខេត្ត"><SearchableSelect name="currProvince" ariaLabel="រាជធានី ឬខេត្តសព្វថ្ងៃ" placeholder="ជ្រើសរើសខេត្ត" options={provinceOptions} value={currProv} loading={locationsLoading} clearable onChange={(value) => { setCurrProv(value); setCurrDist(''); setCurrComm(''); setCurrVill('') }} /></LocationField>
                  <LocationField label="ក្រុង/ស្រុក/ខណ្ឌ"><SearchableSelect name="currDistrict" ariaLabel="ក្រុង ស្រុក ឬខណ្ឌសព្វថ្ងៃ" placeholder="ជ្រើសរើសក្រុង/ស្រុក" options={currDistrictOptions} value={currDist} disabled={!currProv} clearable onChange={(value) => { setCurrDist(value); setCurrComm(''); setCurrVill('') }} /></LocationField>
                  <LocationField label="ឃុំ/សង្កាត់"><SearchableSelect name="currCommune" ariaLabel="ឃុំ ឬសង្កាត់សព្វថ្ងៃ" placeholder="ជ្រើសរើសឃុំ/សង្កាត់" options={currCommuneOptions} value={currComm} disabled={!currDist} clearable onChange={(value) => { setCurrComm(value); setCurrVill('') }} /></LocationField>
                  <LocationField label="ភូមិ"><SearchableSelect name="currVillage" ariaLabel="ភូមិសព្វថ្ងៃ" placeholder="ជ្រើសរើសភូមិ" options={currVillageOptions} value={currVill} disabled={!currComm} clearable onChange={setCurrVill} /></LocationField>
                </div>
              </div>
            </div>
          </EnrollmentSection>

          <EnrollmentSection
            id="student-status"
            number="3"
            title="ស្ថានភាព និងអាហារូបករណ៍"
            description="កំណត់ស្ថានភាពសិស្ស ដើម្បីប្រើក្នុងរបាយការណ៍ និងការគាំទ្រសិស្ស។"
            icon={Award}
          >
            <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
              <Select name="isNewStudent" label="សិស្សថ្មី" options={YES_NO} defaultValue="ទេ" />
              <Select name="isRepeater" label="សិស្សត្រួតថ្នាក់" options={YES_NO} defaultValue="ទេ" />
              <Select name="orphanStatus" label="ស្ថានភាពគ្រួសារ (កំព្រា)" options={['ទេ', 'កំព្រាឪពុក', 'កំព្រាម្តាយ', 'កំព្រាទាំងពីរ']} defaultValue="ទេ" />
              <Select name="isDisabled" label="ពិការភាព" options={YES_NO} defaultValue="ទេ" />
              <Select name="poorStatus" label="ប័ណ្ណក្រីក្រ" options={['គ្មាន', 'ក្រ១', 'ក្រ២']} defaultValue="គ្មាន" />
              <Select name="isEquity" label="សិស្សសមធម៌" options={YES_NO} defaultValue="ទេ" />
              <Select name="isScholarship" label="អាហារូបករណ៍" options={YES_NO} defaultValue="ទេ" />
            </div>
          </EnrollmentSection>

          <EnrollmentSection
            id="guardians"
            number="4"
            title="ព័ត៌មានឪពុកម្តាយ និងអាណាព្យាបាល"
            description="បញ្ចូលព័ត៌មានទំនាក់ទំនងដែលពាក់ព័ន្ធតាមដែលមាន។"
            icon={Users}
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-divider bg-paper p-4">
                <p className="mb-3 text-sm font-extrabold text-text-heading">ឪពុក</p>
                <div className="grid gap-4"><TextField label="ឈ្មោះឪពុក" name="fatherName" placeholder="ឈ្មោះពេញ" /><TextField label="មុខរបរ" name="fatherJob" placeholder="មុខរបរ" /></div>
              </div>
              <div className="rounded-xl border border-divider bg-paper p-4">
                <p className="mb-3 text-sm font-extrabold text-text-heading">ម្តាយ</p>
                <div className="grid gap-4"><TextField label="ឈ្មោះម្តាយ" name="motherName" placeholder="ឈ្មោះពេញ" /><TextField label="មុខរបរ" name="motherJob" placeholder="មុខរបរ" /></div>
              </div>
              <div className="rounded-xl border border-divider bg-paper p-4">
                <p className="mb-3 text-sm font-extrabold text-text-heading">អាណាព្យាបាល</p>
                <div className="grid gap-4"><TextField label="ឈ្មោះអាណាព្យាបាល" name="guardianName" placeholder="ឈ្មោះពេញ" /><TextField label="មុខរបរ" name="guardianJob" placeholder="មុខរបរ" /></div>
              </div>
            </div>
          </EnrollmentSection>

          <EnrollmentSection
            id="additional-details"
            number="5"
            title="ព័ត៌មានបន្ថែម"
            description="ព័ត៌មាននេះមិនចាំបាច់ទេ ប៉ុន្តែអាចជួយគាំទ្រការតាមដានសិស្សបានល្អ។"
            icon={FileText}
          >
            <div className="grid gap-x-5 gap-y-4 md:grid-cols-3">
              <TextField label="ជនជាតិដើមភាគតិច" name="ethnicity" placeholder="ឧ. ព្នង, គួយ" />
              <TextField label="លក្ខណៈពិសេស" name="specialFeatures" placeholder="លក្ខណៈផ្សេងៗ" />
              <TextField label="សេចក្តីផ្សេងៗ" name="otherRemarks" placeholder="ព័ត៌មានបន្ថែម" />
            </div>
          </EnrollmentSection>

          <aside className="flex items-start gap-3 rounded-2xl border border-brand/20 bg-brand/5 p-4 text-sm text-text-body">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
            <div>
              <p className="font-extrabold text-text-heading">មុនពេលរក្សាទុក</p>
              <p className="mt-1 leading-6">សូមពិនិត្យព័ត៌មានមានសញ្ញា <span className="font-bold text-danger">*</span> ឱ្យបានត្រឹមត្រូវ។ អាយុនឹងគណនាស្វ័យប្រវត្តិតាមថ្ងៃខែឆ្នាំកំណើត។</p>
            </div>
          </aside>

          <div className="sticky bottom-3 z-20 rounded-2xl border border-divider bg-bg-surface/95 p-3 shadow-lg backdrop-blur sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                <span>រក្សាទុកសិស្សម្នាក់ ឬនាំចូលបញ្ជីជាឯកសារ</span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="secondary" disabled={isWorking} icon={<Download className="h-4 w-4" aria-hidden="true" />} onClick={downloadTemplate}>
                  ទាញយកគំរូ Excel
                </Button>
                <Button type="button" variant="warning" disabled={isWorking} loading={isImporting} icon={<Upload className="h-4 w-4" aria-hidden="true" />} onClick={() => importInputRef.current?.click()}>
                  នាំចូល Excel / CSV
                </Button>
                <Button type="submit" variant="success" loading={isSaving} disabled={isImporting} icon={<Save className="h-4 w-4" aria-hidden="true" />}>
                  រក្សាទុកព័ត៌មានសិស្ស
                </Button>
                <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={handleExcelImport} />
              </div>
            </div>
          </div>
        </form>
      </div>

      {showAvatarModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-0 sm:items-center sm:justify-center sm:p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="avatar-dialog-title" className="w-full rounded-t-2xl border border-divider bg-bg-surface p-5 shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-divider pb-4">
              <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand"><Smile className="h-5 w-5" aria-hidden="true" /></span><div><h2 id="avatar-dialog-title" className="font-extrabold text-text-heading">ជ្រើសរើសរូបតុក្កតាតំណាង</h2><p className="mt-0.5 text-sm text-text-muted">ជ្រើសរើសរូបមួយសម្រាប់សិស្សនេះ។</p></div></div>
              <button type="button" aria-label="បិទប្រអប់ជ្រើសរូបតំណាង" onClick={() => setShowAvatarModal(false)} className="flex h-11 w-11 items-center justify-center rounded-xl text-text-muted transition hover:bg-paper hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            <div className="mt-5 grid max-h-[55vh] grid-cols-5 gap-2 overflow-y-auto rounded-xl border border-divider bg-paper p-3 sm:grid-cols-8 md:grid-cols-10">
              {[1, 3, 6, 9, 10, 13, 15, 17, 18, 19, 20, 23, 29, 52, 54, 58, 59, 64, 65, 68, 74, 75, 84].map((seed) => (
                <button key={`notionists-${seed}`} type="button" onClick={() => selectAvatar(seed, 'notionists')} className="overflow-hidden rounded-xl border-2 border-transparent bg-bg-surface p-1 transition hover:border-brand focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
                  {/* eslint-disable-next-line @next/next/no-img-element -- dynamically selected remote avatar images are simple previews. */}
                  <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}`} alt={`រូបតំណាងលេខ ${seed}`} />
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-end"><Button type="button" variant="secondary" onClick={() => setShowAvatarModal(false)}>បិទ</Button></div>
          </div>
        </div>
      )}

      {showUrlModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-0 sm:items-center sm:justify-center sm:p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="url-dialog-title" className="w-full rounded-t-2xl border border-divider bg-bg-surface p-5 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><h2 id="url-dialog-title" className="font-extrabold text-text-heading">បញ្ចូលតំណភ្ជាប់រូបភាព</h2><p className="mt-1 text-sm leading-6 text-text-muted">អាចប្រើតំណភ្ជាប់ Google Drive ឬ URL រូបភាពសាធារណៈ។</p></div><button type="button" aria-label="បិទប្រអប់តំណភ្ជាប់រូបភាព" onClick={() => setShowUrlModal(false)} className="flex h-11 w-11 items-center justify-center rounded-xl text-text-muted transition hover:bg-paper hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"><X className="h-5 w-5" aria-hidden="true" /></button></div>
            <label htmlFor="photo-url" className="mt-5 block text-sm font-bold text-text-body">តំណភ្ជាប់រូបភាព</label>
            <input id="photo-url" type="url" value={photoUrlInput} onChange={(event) => setPhotoUrlInput(event.target.value)} className={`mt-1.5 ${inputClassName}`} placeholder="https://drive.google.com/..." autoComplete="url" />
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" onClick={() => setShowUrlModal(false)}>បោះបង់</Button><Button type="button" onClick={applyUrlPhoto}>ប្រើរូបភាពនេះ</Button></div>
          </div>
        </div>
      )}
    </main>
  )
}
