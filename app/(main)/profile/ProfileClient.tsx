'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  User, Users, Building2, ShieldCheck, BriefcaseBusiness, GraduationCap,
  IdCard, MapPin, Eye, EyeOff, Info, TriangleAlert, CheckCircle2, LogOut, Plus, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Select from '@/components/ui/forms/Select'
import ConfirmDialog from '@/components/ui/overlay/ConfirmDialog'
import { notify } from '@/components/ui/feedback/notify'
import SectionCard from '@/components/profile/SectionCard'
import StickySaveBar from '@/components/profile/StickySaveBar'
import LocationCascade, { type LocationTree, type LocationValue } from '@/components/profile/LocationCascade'
import ImageUploadField from '@/components/profile/ImageUploadField'
import ChildrenRepeater from '@/components/profile/ChildrenRepeater'
import ReportHeaderPreview from '@/components/profile/ReportHeaderPreview'
import { saveProfileSection, changePassword } from './actions'
import {
  SECTION_SCHEMAS, REPORT_REQUIRED_FIELDS, IMAGE_FIELDS, isFilled,
  type SectionId, type ChildInput,
} from '@/lib/profile/schema'
import type { Settings, TeacherProfile } from '@/lib/types'
import { STORAGE_KEYS } from '@/lib/constants/storage'
import { STANDARD_SUBJECT_LABELS } from '@/lib/constants/subjects'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { getErrorMessage } from '@/lib/utils/errors'
import { logger } from '@/lib/utils/logger'

/**
 * The teacher's profile, rebuilt as five tabbed groups with per-section
 * saves. Every printed surface in the app reads its letterhead out of
 * `settings`, so the school tab renders a live preview of the assembled
 * report header and flags exactly which missing fields would print as dots.
 *
 * Desktop (≥1024px): ARIA tabs. Mobile: a vertical section list with anchor
 * navigation and per-group completion badges — both variants are in the DOM
 * and CSS picks one, so there is no media-query state and no hydration flash.
 *
 * Saves go through server actions (`./actions.ts`) that whitelist each
 * section's columns, so a save can never overwrite another section's fields
 * with stale client state. Unsaved edits survive a session-expiry redirect
 * via a sessionStorage draft (PII, so never localStorage).
 */

type FormState = Record<string, string | string[] | ChildInput[]>

/* ----------------------------------------------------------------------------
 * Field registry — which form keys each section owns (mirrors lib/profile/schema)
 * ------------------------------------------------------------------------- */

const SECTION_FIELDS: Record<SectionId, string[]> = {
  personal: [
    'surname', 'name', 'gender', 'phone', 'photo_url',
    'date_of_birth', 'nationality', 'ethnicity', 'disability_type',
    'id_card_type', 'id_card_number', 'id_card_expiry',
    'birth_province', 'birth_district', 'birth_commune', 'birth_village',
    'res_province', 'res_district', 'res_commune', 'res_village',
  ],
  work: [
    'specialized_subjects', 'grade_levels', 'teacher_code', 'service_start_date',
    'teaching_type', 'shift', 'teacher_status', 'appointment_start_date', 'appointment_end_date',
  ],
  civil: [
    'civil_servant_id', 'rank_position', 'function_role', 'work_type', 'framework_category',
    'rank_class', 'rank_step', 'rank_type', 'appointment_decree_number', 'appointment_decree_date', 'salary_rank',
  ],
  training: ['education_level', 'training_level', 'seniority_years', 'diploma'],
  family: ['marital_status', 'spouse_name', 'spouse_occupation', 'spouse_phone', 'children_count', 'children'],
  school: [
    'management_unit_1', 'management_unit_2', 'school_name', 'school_code', 'class_name',
    'homeroom_teacher', 'manager_role', 'director_name', 'province_for_date', 'academic_year',
    'principal_phone', 'admin_province', 'admin_district', 'admin_commune',
    'school_logo', 'director_seal', 'teacher_signature',
  ],
}

/** Starred fields the save refuses to blank — the UI promise behind the `*`. */
const REQUIRED_BY_SECTION: Partial<Record<SectionId, string[]>> = {
  personal: ['surname', 'name', 'gender'],
  school: ['school_name'],
}

const SECTION_LABELS: Record<SectionId, string> = {
  personal: 'ព័ត៌មានផ្ទាល់ខ្លួន',
  work: 'ព័ត៌មានការងារ',
  civil: 'ព័ត៌មានមន្ត្រីរាជការ',
  training: 'ព័ត៌មានការបណ្ដុះបណ្ដាល',
  family: 'ព័ត៌មានគ្រួសារ',
  school: 'សាលា និងរបាយការណ៍',
}

const TABS: { id: string; label: string; icon: React.ElementType; sections: SectionId[] }[] = [
  { id: 'personal', label: 'ផ្ទាល់ខ្លួន', icon: User, sections: ['personal'] },
  { id: 'career', label: 'ការងារ', icon: BriefcaseBusiness, sections: ['work', 'civil', 'training'] },
  { id: 'family', label: 'គ្រួសារ', icon: Users, sections: ['family'] },
  { id: 'school', label: 'សាលា និងរបាយការណ៍', icon: Building2, sections: ['school'] },
  { id: 'account', label: 'គណនី និងសុវត្ថិភាព', icon: ShieldCheck, sections: [] },
]

const inputClass =
  'h-11 w-full rounded-lg border border-divider bg-bg-surface px-4 text-sm leading-[1.7] text-text-heading transition outline-none hover:border-brand/60 focus:border-brand focus:ring-2 focus:ring-focus-ring/30'

/**
 * Form plumbing shared with the module-level field components. `Field` and
 * `SelectField` must live at module scope — defined inside the client
 * component their identity would change every render, and React would
 * remount the input on each keystroke, dropping focus.
 */
const FormCtx = createContext<{
  get: (key: string) => string
  errors: Record<string, string>
  set: (key: string, value: string) => void
} | null>(null)

function Field({
  k, label, required, helper, placeholder, type = 'text', inputMode, autoComplete,
}: {
  k: string
  label: string
  required?: boolean
  helper?: string
  placeholder?: string
  type?: string
  inputMode?: 'numeric' | 'tel'
  autoComplete?: string
}) {
  const ctx = useContext(FormCtx)
  if (!ctx) return null
  const error = ctx.errors[k]
  return (
    <div>
      <label lang="km" htmlFor={`field-${k}`} className="mb-1 block text-[13px] font-bold leading-[1.7] text-text-body">
        {label}
        {required && <span aria-hidden className="ml-0.5 text-danger">*</span>}
      </label>
      <input
        id={`field-${k}`}
        type={type}
        lang="km"
        inputMode={inputMode}
        autoComplete={autoComplete}
        required={required}
        value={ctx.get(k)}
        onChange={(e) => ctx.set(k, e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `err-${k}` : helper ? `help-${k}` : undefined}
        className={`${inputClass} ${error ? 'border-danger focus:border-danger' : ''}`}
      />
      {error ? (
        <p id={`err-${k}`} lang="km" className="mt-1 text-[12px] font-semibold leading-[1.7] text-danger">
          {error}
        </p>
      ) : helper ? (
        <p id={`help-${k}`} lang="km" className="mt-1 text-[11px] leading-[1.7] text-text-muted">
          {helper}
        </p>
      ) : null}
    </div>
  )
}

function SelectField({
  k, label, options, required, placeholder,
}: {
  k: string
  label: string
  options: string[]
  required?: boolean
  placeholder: string
}) {
  const ctx = useContext(FormCtx)
  if (!ctx) return null
  return (
    <Select
      id={`field-${k}`}
      label={label}
      options={options}
      value={ctx.get(k)}
      required={required}
      placeholder={placeholder}
      onChange={(v) => ctx.set(k, v)}
    />
  )
}

const DESKTOP_QUERY = '(min-width: 1024px)'
const subscribeDesktop = (cb: () => void) => {
  const mq = window.matchMedia(DESKTOP_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
/**
 * Whether the ARIA tabs pattern is active. Below 1024px the tablist is
 * display:none, so the panels must NOT claim role="tabpanel" — a screen
 * reader would meet five tabpanels whose tabs don't exist in the tree.
 */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  )
}

/** Collapsible wrapper for the mobile report preview — stateful so a page
 * re-render can never snap it back open the way `<details open>` would. */
function MobileDisclosure({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-5 rounded-lg border border-divider bg-paper xl:hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        lang="km"
        className="tap-target w-full cursor-pointer px-4 py-3 text-left text-sm font-bold leading-[1.7] text-text-heading focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        {title} {open ? '▴' : '▾'}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

/** Read a settings value, accepting either half of a legacy pair. */
function readPaired(s: Settings | null, main: keyof Settings, twin: keyof Settings): string {
  const a = s?.[main]
  if (typeof a === 'string' && a) return a
  const b = s?.[twin]
  return typeof b === 'string' ? b : ''
}

function buildInitialForm(s: Settings | null, p: TeacherProfile | null): FormState {
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const form: FormState = {}
  for (const fields of Object.values(SECTION_FIELDS)) {
    for (const key of fields) form[key] = ''
  }
  // settings-backed
  for (const key of [...SECTION_FIELDS.school, 'surname', 'name', 'gender', 'phone', 'photo_url', 'education_level', 'training_level', 'seniority_years'] as (keyof Settings)[]) {
    if (s && key in s) form[key] = str(s[key])
  }
  form.homeroom_teacher = readPaired(s, 'homeroom_teacher', 'teacher_name')
  form.director_name = readPaired(s, 'director_name', 'manager_name')
  form.province_for_date = readPaired(s, 'province_for_date', 'province_date')
  // teacher_profiles-backed
  if (p) {
    for (const [key, value] of Object.entries(p)) {
      if (key === 'children') form.children = Array.isArray(value) ? (value as ChildInput[]) : []
      else if (key === 'specialized_subjects') form.specialized_subjects = Array.isArray(value) ? (value as string[]) : []
      else if (key === 'children_count') form.children_count = value == null ? '' : String(value)
      else if (typeof value === 'string') form[key] = value
    }
  }
  if (!Array.isArray(form.children)) form.children = []
  if (!Array.isArray(form.specialized_subjects)) form.specialized_subjects = []
  return form
}

function fieldsEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b)
  return a === b
}

export default function ProfileClient({
  initialSettings,
  initialProfile,
  userId,
  email,
  emailVerified,
}: {
  initialSettings: Settings | null
  initialProfile: TeacherProfile | null
  userId: string
  email: string
  emailVerified: boolean
}) {
  const supabase = createClient()

  const [form, setForm] = useState<FormState>(() => buildInitialForm(initialSettings, initialProfile))
  const [saved, setSaved] = useState<FormState>(() => buildInitialForm(initialSettings, initialProfile))
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState<string | null>(initialSettings?.updated_at ?? null)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [liveMessage, setLiveMessage] = useState('')
  const [conflictOpen, setConflictOpen] = useState(false)

  // First-time teacher: no row in either table → guided 3-step start instead
  // of a wall of empty fields.
  const [mode, setMode] = useState<'wizard' | 'full'>(
    initialSettings === null && initialProfile === null ? 'wizard' : 'full',
  )
  const [wizardStep, setWizardStep] = useState(0)

  const [activeTab, setActiveTab] = useState('personal')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const isDesktop = useIsDesktop()

  const [locations, setLocations] = useState<LocationTree | null>(null)
  const [locationsLoading, setLocationsLoading] = useState(true)

  const [subjectInput, setSubjectInput] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)

  /* ---------------------------------------------------------------- data */

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

  /* ------------------------------------------------------- dirty tracking */

  const dirtySections = useMemo(() => {
    return (Object.keys(SECTION_FIELDS) as SectionId[]).filter((section) =>
      SECTION_FIELDS[section].some((key) => !fieldsEqual(form[key], saved[key])),
    )
  }, [form, saved])
  const anyDirty = dirtySections.length > 0

  // Draft persistence — sessionStorage only (this form carries PII); restored
  // after a session-expiry round trip so re-login never loses typed input.
  const restoredDraft = useRef(false)
  useEffect(() => {
    if (restoredDraft.current) return
    restoredDraft.current = true
    // Deferred a tick: the restore must run after hydration (sessionStorage
    // does not exist server-side, so it cannot seed useState), and deferring
    // keeps the state update out of the effect's synchronous body.
    const t = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEYS.profileDraft)
        if (!raw) return
        const draft = JSON.parse(raw) as { uid?: string; form?: FormState }
        // The draft carries PII: a shared staff-room computer must never
        // restore teacher A's typing into teacher B's account.
        if (draft.uid !== userId || !draft.form) {
          sessionStorage.removeItem(STORAGE_KEYS.profileDraft)
          return
        }
        const form = draft.form
        setForm((prev) => ({ ...prev, ...form }))
        notify.success('បានស្ដារការកែប្រែដែលមិនទាន់រក្សាទុក')
      } catch {
        sessionStorage.removeItem(STORAGE_KEYS.profileDraft)
      }
    }, 0)
    return () => clearTimeout(t)
  }, [userId])

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (anyDirty) sessionStorage.setItem(STORAGE_KEYS.profileDraft, JSON.stringify({ uid: userId, form }))
        else sessionStorage.removeItem(STORAGE_KEYS.profileDraft)
      } catch {
        // Quota exhausted (large images) — the draft is best-effort only.
      }
    }, 400)
    return () => clearTimeout(t)
  }, [form, anyDirty, userId])

  useEffect(() => {
    if (!anyDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Several engines only show the prompt when returnValue is assigned.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [anyDirty])

  /* ----------------------------------------------------------- mutators */

  const setF = useCallback((key: string, value: string | string[] | ChildInput[]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const str = (key: string): string => {
    const v = form[key]
    return typeof v === 'string' ? v : ''
  }

  const locationValue = (prefix: 'birth' | 'res' | 'admin'): LocationValue => ({
    province: str(`${prefix}_province`),
    district: str(`${prefix}_district`),
    commune: str(`${prefix}_commune`),
    village: prefix === 'admin' ? undefined : str(`${prefix}_village`),
  })
  const setLocation = (prefix: 'birth' | 'res' | 'admin') => (v: LocationValue) => {
    setForm((prev) => ({
      ...prev,
      [`${prefix}_province`]: v.province,
      [`${prefix}_district`]: v.district,
      [`${prefix}_commune`]: v.commune,
      ...(prefix === 'admin' ? {} : { [`${prefix}_village`]: v.village ?? '' }),
    }))
  }

  /* ------------------------------------------------------------- saving */

  const sectionValues = useCallback(
    (section: SectionId): Record<string, unknown> => {
      const out: Record<string, unknown> = {}
      for (const key of SECTION_FIELDS[section]) {
        // Unchanged image fields are omitted: the schema then never rejects a
        // pre-existing stored value (legacy URL, oversized logo) the teacher
        // didn't touch, and the upsert leaves the column alone.
        if ((IMAGE_FIELDS as readonly string[]).includes(key) && fieldsEqual(form[key], saved[key])) continue
        out[key] = form[key]
      }
      return out
    },
    [form, saved],
  )

  /** Client-side pass through the same Zod schemas the server uses. */
  const validateSections = (sections: SectionId[]): boolean => {
    const errors: Record<string, string> = {}
    for (const section of sections) {
      for (const key of REQUIRED_BY_SECTION[section] ?? []) {
        if (!isFilled(form[key])) errors[key] = 'ចាំបាច់បំពេញ'
      }
      const values = sectionValues(section)
      for (const schema of [SECTION_SCHEMAS[section].settings, SECTION_SCHEMAS[section].profile]) {
        if (!schema) continue
        const parsed = schema.safeParse(values)
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            const key = String(issue.path[0] ?? section)
            if (!errors[key]) errors[key] = issue.message
          }
        }
      }
    }
    setFieldErrors(errors)
    const messages = Object.values(errors)
    if (messages.length > 0) {
      // The first concrete message rides in the toast, so an error on a
      // control without inline error display is still visible somewhere.
      notify.error(`សូមពិនិត្យប្រអប់ដែលមានកំហុស៖ ${messages[0]}`)
      setLiveMessage('មានកំហុសក្នុងទម្រង់ — មិនទាន់រក្សាទុកទេ')
      return false
    }
    return true
  }

  const saveSections = async (sections: SectionId[], force = false): Promise<boolean> => {
    if (sections.length === 0) return true
    if (!validateSections(sections)) return false

    setSaving(true)
    const toastId = notify.loading('កំពុងរក្សាទុក...')
    try {
      // Tracked locally: when two settings-backed sections save in one batch,
      // the second must compare against the first's fresh timestamp, not the
      // stale value closed over from render state.
      let expectedUpdatedAt = settingsUpdatedAt
      for (const section of sections) {
        const values = sectionValues(section)
        const result = await saveProfileSection(section, values, {
          expectedUpdatedAt,
          force,
        })
        // Applied before the error checks: a partial failure (settings wrote,
        // teacher_profiles errored) still advances the timestamp, so the retry
        // doesn't read the user's own write as a phantom conflict.
        if (result.updatedAt) {
          expectedUpdatedAt = result.updatedAt
          setSettingsUpdatedAt(result.updatedAt)
        }
        if (result.conflict) {
          notify.settle(toastId, false, 'ទិន្នន័យត្រូវបានកែប្រែពីឧបករណ៍ផ្សេង')
          setConflictOpen(true)
          return false
        }
        if (result.error) {
          // Typed values stay exactly as they are — a failed request never
          // clears the form.
          notify.settle(toastId, false, 'មិនអាចរក្សាទុកបានទេ៖ ' + result.error)
          setLiveMessage('រក្សាទុកបរាជ័យ')
          return false
        }
        // Snapshot the CANONICAL values the schemas produced (phone stripped
        // of spaces, Khmer digits latinised, unnamed child rows dropped) into
        // both form and saved, so "clean" means exactly what the DB holds.
        const canonical: Record<string, unknown> = {}
        for (const schema of [SECTION_SCHEMAS[section].settings, SECTION_SCHEMAS[section].profile]) {
          if (!schema) continue
          const parsed = schema.safeParse(values)
          if (parsed.success) Object.assign(canonical, parsed.data)
        }
        setForm((prev) => ({ ...prev, ...canonical } as FormState))
        setSaved((prev) => {
          const next = { ...prev, ...canonical } as FormState
          // Omitted (unchanged) image fields keep their prior snapshot; every
          // other field now mirrors what was written.
          for (const key of SECTION_FIELDS[section]) {
            if (!(key in canonical)) next[key] = form[key]
          }
          return next
        })
      }
      notify.settle(toastId, true, 'រក្សាទុកដោយជោគជ័យ')
      setLiveMessage('រក្សាទុកដោយជោគជ័យ')
      try {
        sessionStorage.removeItem(STORAGE_KEYS.profileDraft)
      } catch {}
      return true
    } catch (error: unknown) {
      logger.error('Error saving profile:', error)
      notify.settle(toastId, false, 'មិនអាចរក្សាទុកបានទេ៖ ' + getErrorMessage(error))
      setLiveMessage('រក្សាទុកបរាជ័យ')
      return false
    } finally {
      setSaving(false)
    }
  }

  const discardChanges = () => {
    setForm(saved)
    setFieldErrors({})
    try {
      sessionStorage.removeItem(STORAGE_KEYS.profileDraft)
    } catch {}
    setLiveMessage('បានបោះបង់ការកែប្រែ')
  }

  /* ----------------------------------------------------- derived display */

  const completion = useMemo(() => {
    const married = form.marital_status === 'រៀបការ'
    const out = {} as Record<SectionId, { filled: number; total: number }>
    for (const section of Object.keys(SECTION_FIELDS) as SectionId[]) {
      // Spouse fields only exist for a married teacher — counting them
      // otherwise makes the family badge unreachable.
      const fields =
        section === 'family' && !married
          ? SECTION_FIELDS[section].filter((key) => !key.startsWith('spouse_'))
          : SECTION_FIELDS[section]
      out[section] = {
        filled: fields.filter((key) => isFilled(form[key])).length,
        total: fields.length,
      }
    }
    return out
  }, [form])

  const missingReportFields = useMemo(
    () => REPORT_REQUIRED_FIELDS.filter(({ key }) => !isFilled(form[key])),
    [form],
  )

  const isMarried = str('marital_status') === 'រៀបការ'

  const previewValues = {
    management_unit_1: str('management_unit_1'),
    management_unit_2: str('management_unit_2'),
    school_name: str('school_name'),
    academic_year: str('academic_year'),
    manager_role: str('manager_role'),
    director_name: str('director_name'),
    province_for_date: str('province_for_date'),
    homeroom_teacher: str('homeroom_teacher'),
    school_logo: str('school_logo'),
    director_seal: str('director_seal'),
    teacher_signature: str('teacher_signature'),
  }

  /* ------------------------------------------------------- small pieces */

  const formCtxValue = { get: str, errors: fieldErrors, set: setF }

  const addSubject = (raw: string) => {
    const value = raw.trim()
    if (!value) return
    const current = (form.specialized_subjects as string[]) ?? []
    if (current.length >= 20) {
      notify.error('អាចបញ្ចូលបានច្រើនបំផុត ២០ មុខវិជ្ជា')
      return
    }
    if (!current.includes(value)) setF('specialized_subjects', [...current, value])
    setSubjectInput('')
  }

  /* ---------------------------------------------------------- section UI */

  const personalSection = (
    <SectionCard id="sec-personal" title={SECTION_LABELS.personal} icon={<User className="h-5 w-5" aria-hidden />} completion={completion.personal}>
      <div className="space-y-6">
        <ImageUploadField
          label="រូបថតគ្រូ"
          value={str('photo_url')}
          onChange={(v) => setF('photo_url', v)}
          shape="circle"
          maxEdge={300}
          mime="image/jpeg"
          helper="រូបថតបែប JPG ឬ PNG មិនលើស 5MB — បង្ហាញក្នុងកម្មវិធីតែប៉ុណ្ណោះ មិនបោះពុម្ពទេ។"
          uploadLabel="ប្ដូររូបថត"
          error={fieldErrors.photo_url}
          fallback={<User aria-hidden className="h-8 w-8 text-text-muted" />}
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <Field k="surname" label="នាមត្រកូល" required placeholder="ឧ. រុន" />
          <Field k="name" label="នាមខ្លួន" required placeholder="ឧ. រស្មី" />
          <SelectField k="gender" label="ភេទ" options={['ប្រុស', 'ស្រី']} required placeholder="ជ្រើសរើសភេទ" />
          <Field k="date_of_birth" label="ថ្ងៃកំណើត" type="date" />
          <Field k="nationality" label="សញ្ជាតិ" placeholder="ឧ. ខ្មែរ" />
          <Field k="ethnicity" label="ជនជាតិ" placeholder="ឧ. ខ្មែរ" />
          <Field k="disability_type" label="ប្រភេទពិការភាព" helper="ទុកចំហរ ប្រសិនបើគ្មាន។" />
          <Field k="phone" label="លេខទូរស័ព្ទ" type="tel" inputMode="tel" placeholder="012 345 678" helper="លេខទូរស័ព្ទកម្ពុជា — អាចវាយជាលេខខ្មែរ ឬឡាតាំង។" />
        </div>

        <fieldset className="rounded-lg border border-divider bg-paper/60 p-4">
          <legend lang="km" className="flex items-center gap-1.5 px-1 text-sm font-bold text-text-heading">
            <IdCard aria-hidden className="h-4 w-4 text-brand" /> អត្តសញ្ញាណប័ណ្ណ
          </legend>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <SelectField k="id_card_type" label="ប្រភេទអត្តសញ្ញាណប័ណ្ណ" options={['មានសុពលភាព', 'អចិន្ត្រៃយ៍']} placeholder="ជ្រើសរើសប្រភេទប័ណ្ណ" />
            <Field k="id_card_number" label="លេខអត្តសញ្ញាណប័ណ្ណ" inputMode="numeric" helper="វាយជាលេខ — លេខខ្មែរប្ដូរជាឡាតាំងស្វ័យប្រវត្តិ។" />
            <Field k="id_card_expiry" label="ថ្ងៃផុតកំណត់" type="date" />
          </div>
        </fieldset>

        <fieldset>
          <legend lang="km" className="mb-3 flex items-center gap-1.5 text-sm font-bold text-text-heading">
            <MapPin aria-hidden className="h-4 w-4 text-brand" /> ទីកន្លែងកំណើត
          </legend>
          <LocationCascade
            idPrefix="birth"
            levels={4}
            locations={locations}
            loading={locationsLoading}
            value={locationValue('birth')}
            onChange={setLocation('birth')}
          />
        </fieldset>

        <fieldset>
          <legend lang="km" className="mb-3 flex items-center gap-1.5 text-sm font-bold text-text-heading">
            <MapPin aria-hidden className="h-4 w-4 text-brand" /> ទីកន្លែងស្នាក់នៅបច្ចុប្បន្ន
          </legend>
          <LocationCascade
            idPrefix="res"
            levels={4}
            locations={locations}
            loading={locationsLoading}
            value={locationValue('res')}
            onChange={setLocation('res')}
            copyFrom={{ label: 'ដូចទីកន្លែងកំណើត', value: locationValue('birth') }}
          />
        </fieldset>
      </div>
    </SectionCard>
  )

  const workSection = (
    <SectionCard id="sec-work" title={SECTION_LABELS.work} icon={<BriefcaseBusiness className="h-5 w-5" aria-hidden />} completion={completion.work}>
      <div className="space-y-5">
        <div>
          <label lang="km" htmlFor="field-specialized_subjects" className="mb-1 block text-[13px] font-bold leading-[1.7] text-text-body">
            មុខវិជ្ជាឯកទេស/បង្រៀន
          </label>
          {(form.specialized_subjects as string[]).length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {(form.specialized_subjects as string[]).map((subject) => (
                <li key={subject} className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand-100 px-3 py-1.5 text-[13px] font-semibold leading-[1.7] text-brand">
                  <span lang="km">{subject}</span>
                  <button
                    type="button"
                    aria-label={`ដកចេញ ${subject}`}
                    onClick={() => setF('specialized_subjects', (form.specialized_subjects as string[]).filter((s) => s !== subject))}
                    className="tap-target -mr-1 cursor-pointer rounded-full p-1 hover:bg-brand/10 focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <X aria-hidden className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              id="field-specialized_subjects"
              type="text"
              lang="km"
              value={subjectInput}
              maxLength={80}
              onChange={(e) => setSubjectInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addSubject(subjectInput)
                }
              }}
              placeholder="ឧ. គណិតវិទ្យា"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => addSubject(subjectInput)}
              className="tap-target inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-divider bg-bg-surface px-4 text-sm font-bold text-brand transition hover:bg-brand-100 focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <Plus aria-hidden className="h-4 w-4" /> បន្ថែម
            </button>
          </div>
          {fieldErrors.specialized_subjects && (
            <p lang="km" role="alert" className="mt-1 text-[12px] font-semibold leading-[1.7] text-danger">
              {fieldErrors.specialized_subjects}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.values(STANDARD_SUBJECT_LABELS)
              .filter((label) => !(form.specialized_subjects as string[]).includes(label))
              .slice(0, 6)
              .map((label) => (
                <button
                  key={label}
                  type="button"
                  lang="km"
                  onClick={() => addSubject(label)}
                  className="tap-target cursor-pointer rounded-full border border-divider bg-paper px-3 py-1.5 text-[12px] leading-[1.7] text-text-muted transition hover:border-brand/40 hover:text-brand focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  + {label}
                </button>
              ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <Field k="grade_levels" label="កម្រិតថ្នាក់" placeholder="ឧ. ថ្នាក់ទី៤-៦" />
          <Field k="teacher_code" label="លេខសម្គាល់គ្រូ" inputMode="numeric" helper="វាយជាលេខ។" />
          <Field k="service_start_date" label="ថ្ងៃចូលបម្រើការ" type="date" />
          <Field k="teaching_type" label="ប្រភេទនៃការបង្រៀន" placeholder="ឧ. បង្រៀនថ្នាក់ដឹកនាំ" />
          <SelectField k="shift" label="វេន" options={['ព្រឹក', 'រសៀល', 'ពេញមួយថ្ងៃ']} placeholder="ជ្រើសរើសវេន" />
          <Field k="teacher_status" label="ស្ថានភាពគ្រូបង្រៀន" placeholder="ឧ. បម្រើការ" />
          <Field k="appointment_start_date" label="ចាប់ផ្ដើមកាលបរិច្ឆេទ" type="date" />
          <Field k="appointment_end_date" label="បញ្ចប់កាលបរិច្ឆេទ" type="date" helper="ត្រូវក្រោយកាលបរិច្ឆេទចាប់ផ្ដើម។" />
        </div>
      </div>
    </SectionCard>
  )

  const civilFilled = completion.civil.filled
  const civilSection = (
    <SectionCard
      id="sec-civil"
      title={SECTION_LABELS.civil}
      icon={<IdCard className="h-5 w-5" aria-hidden />}
      completion={completion.civil}
      collapsible
      defaultOpen={civilFilled > 0}
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <Field k="civil_servant_id" label="អត្តលេខមន្ត្រីរាជការ" inputMode="numeric" helper="វាយជាលេខ។" />
        <Field k="rank_position" label="ឋានៈ និងមុខតំណែង" placeholder="ឧ. គ្រូបង្រៀនកម្រិតមូលដ្ឋាន" />
        <Field k="function_role" label="មុខងារ" placeholder="ឧ. គ្រូបន្ទុកថ្នាក់" />
        <Field k="work_type" label="ប្រភេទការងារ" />
        <Field k="framework_category" label="ក្របខណ្ឌ" placeholder="ឧ. ក្របខណ្ឌ គ" />
        <Field k="rank_class" label="ថ្នាក់" placeholder="ឧ. ថ្នាក់ទី៣" />
        <Field k="rank_step" label="កាំ" placeholder="ឧ. កាំទី២" />
        <Field k="rank_type" label="ប្រភេទឋានៈ" />
        <Field k="appointment_decree_number" label="លេខប្រកាសតែងតាំង" />
        <Field k="appointment_decree_date" label="កាលបរិច្ឆេទប្រកាសតែងតាំង" type="date" />
        <Field k="salary_rank" label="កាំប្រាក់ និងឋានន្តរស័ក្ត" placeholder="ឧ. គ.3.1" />
      </div>
    </SectionCard>
  )

  const trainingSection = (
    <SectionCard
      id="sec-training"
      title={SECTION_LABELS.training}
      icon={<GraduationCap className="h-5 w-5" aria-hidden />}
      completion={completion.training}
      collapsible
      defaultOpen={completion.training.filled > 0}
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Field k="education_level" label="កម្រិតវប្បធម៌" placeholder="ឧ. បរិញ្ញាប័ត្រ" />
        <Field k="training_level" label="កម្រិតបណ្ដុះបណ្ដាល" placeholder="ឧ. ១២+៤" />
        <Field k="seniority_years" label="អតីតភាពឆ្នាំ" helper="ចំនួនឆ្នាំបម្រើការ។" />
        <Field k="diploma" label="សញ្ញាបត្រ" placeholder="ឧ. បរិញ្ញាប័ត្រអប់រំ" />
      </div>
    </SectionCard>
  )

  const familySection = (
    <SectionCard id="sec-family" title={SECTION_LABELS.family} icon={<Users className="h-5 w-5" aria-hidden />} completion={completion.family}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <SelectField
            k="marital_status"
            label="ស្ថានភាពគ្រួសារ"
            options={['នៅលីវ', 'រៀបការ', 'មេម៉ាយ/ពោះម៉ាយ', 'ផ្សេងៗ']}
            placeholder="ជ្រើសរើសស្ថានភាព"
          />
          {isMarried && (
            <>
              <Field k="spouse_name" label="ឈ្មោះប្ដី/ប្រពន្ធ" />
              <Field k="spouse_occupation" label="មុខរបរប្ដី/ប្រពន្ធ" />
              <Field k="spouse_phone" label="លេខទូរស័ព្ទប្ដី/ប្រពន្ធ" type="tel" inputMode="tel" placeholder="012 345 678" />
            </>
          )}
        </div>
        <ChildrenRepeater
          count={str('children_count')}
          rows={form.children as ChildInput[]}
          onChange={(count, rows) => {
            setForm((prev) => ({ ...prev, children_count: count, children: rows }))
          }}
          inputClass={inputClass}
        />
      </div>
    </SectionCard>
  )

  const schoolFormFields = (
    <div className="space-y-6">
      {missingReportFields.length > 0 ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4" role="region" aria-label="ព័ត៌មានខ្វះខាតសម្រាប់របាយការណ៍">
          <p lang="km" className="flex items-start gap-2 text-sm font-bold leading-[1.7] text-text-heading">
            <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            របាយការណ៍នឹងបោះពុម្ពជាចំណុចៗ ដោយសារខ្វះ៖
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {missingReportFields.map(({ key, label }) => (
              <li key={key}>
                <button
                  type="button"
                  lang="km"
                  onClick={() => {
                    document.getElementById(`field-${key}`)?.scrollIntoView({ block: 'center' })
                    document.getElementById(`field-${key}`)?.focus()
                  }}
                  className="tap-target cursor-pointer rounded-full border border-warning/40 bg-bg-surface px-3 py-1.5 text-[12px] font-semibold leading-[1.7] text-text-body transition hover:border-warning focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p lang="km" className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm font-semibold leading-[1.7] text-success">
          <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" /> ក្បាលរបាយការណ៍មានព័ត៌មានគ្រប់គ្រាន់ហើយ
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field k="management_unit_1" label="អង្គភាពគ្រប់គ្រង ១" placeholder="មន្ទីរអប់រំ យុវជន និងកីឡា..." />
        <Field k="management_unit_2" label="អង្គភាពគ្រប់គ្រង ២" placeholder="ការិយាល័យអប់រំ យុវជន និងកីឡា..." />
        <Field k="school_name" label="ឈ្មោះសាលា" required placeholder="សាលាបឋមសិក្សា..." />
        <Field k="school_code" label="លេខកូដសាលា" inputMode="numeric" placeholder="ឧ. 14090207006" helper="បោះពុម្ពលើបញ្ជីឈ្មោះសិស្ស។" />
        <Field k="class_name" label="ឈ្មោះថ្នាក់" placeholder="ឧ. ថ្នាក់ទី៦ «ក»" />
        <Field k="academic_year" label="ឆ្នាំសិក្សា" placeholder="ឧ. ២០២៥-២០២៦" />
        <Field k="homeroom_teacher" label="ឈ្មោះគ្រូបន្ទុក" helper="បោះពុម្ពនៅកន្លែងចុះហត្ថលេខាគ្រូ។" />
        <Field k="province_for_date" label="ខេត្ត (សម្រាប់ថ្ងៃខែ)" helper="បង្ហាញក្នុងឃ្លា «ធ្វើនៅ ___ ថ្ងៃទី...»។" />
        <Field k="manager_role" label="ងារនាយក" placeholder="ឧ. នាយកសាលា" helper="តួនាទីបោះពុម្ពពីលើឈ្មោះនាយក។" />
        <Field k="director_name" label="ឈ្មោះនាយក" helper="បោះពុម្ពក្រោមតួនាទីខាងលើ លើឯកសារផ្លូវការ។" />
        <Field k="principal_phone" label="ទូរស័ព្ទសាលា" type="tel" inputMode="tel" placeholder="012 345 678" />
      </div>

      <fieldset>
        <legend lang="km" className="mb-3 flex items-center gap-1.5 text-sm font-bold text-text-heading">
          <MapPin aria-hidden className="h-4 w-4 text-brand" /> ទីតាំងរដ្ឋបាលនៃអង្គភាព
        </legend>
        <LocationCascade
          idPrefix="admin"
          levels={3}
          locations={locations}
          loading={locationsLoading}
          value={locationValue('admin')}
          onChange={setLocation('admin')}
        />
      </fieldset>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ImageUploadField
          label="ស្លាកសញ្ញាសាលា (Logo)"
          value={str('school_logo')}
          onChange={(v) => setF('school_logo', v)}
          maxEdge={500}
          mime="image/png"
          helper="ប្រើរូបផ្ទៃថ្លា (Transparent PNG) — បង្ហាញលើកាតសិស្ស និងក្បាលរបាយការណ៍។"
          uploadLabel="ជ្រើសរើសឡូហ្គោ"
          error={fieldErrors.school_logo}
          fallback={<Building2 aria-hidden className="h-7 w-7 text-brand-300" />}
        />
        <ImageUploadField
          label="ត្រានាយក"
          value={str('director_seal')}
          onChange={(v) => setF('director_seal', v)}
          maxEdge={400}
          mime="image/png"
          helper="ត្រាសាលា ផ្ទៃថ្លា — បោះពុម្ពក្បែរឈ្មោះនាយកលើឯកសារ។"
          uploadLabel="ជ្រើសរើសត្រា"
          error={fieldErrors.director_seal}
        />
        <ImageUploadField
          label="ហត្ថលេខាគ្រូ"
          value={str('teacher_signature')}
          onChange={(v) => setF('teacher_signature', v)}
          maxEdge={400}
          mime="image/png"
          helper="ហត្ថលេខាលើផ្ទៃថ្លា ឬក្រដាសស — បោះពុម្ពនៅប្លុកហត្ថលេខាគ្រូបន្ទុក។"
          uploadLabel="ជ្រើសរើសហត្ថលេខា"
          error={fieldErrors.teacher_signature}
        />
      </div>
    </div>
  )

  const schoolSection = (
    <SectionCard id="sec-school" title={SECTION_LABELS.school} icon={<Building2 className="h-5 w-5" aria-hidden />} completion={completion.school}>
      <div className="gap-6 xl:grid xl:grid-cols-[1fr_340px] xl:items-start">
        {/* Mobile/tablet: preview pinned above the fields, collapsible. */}
        <MobileDisclosure title="គំរូក្បាលរបាយការណ៍ (បង្ហាញផ្ទាល់)">
          <ReportHeaderPreview values={previewValues} />
        </MobileDisclosure>

        <div>{schoolFormFields}</div>

        {/* Desktop: sticky right column that updates live while typing. */}
        <div className="hidden xl:sticky xl:top-24 xl:block">
          <p lang="km" className="mb-2 text-sm font-bold leading-[1.7] text-text-heading">
            គំរូក្បាលរបាយការណ៍ (បង្ហាញផ្ទាល់)
          </p>
          <ReportHeaderPreview values={previewValues} />
          <p lang="km" className="mt-2 text-[11px] leading-[1.7] text-text-muted">
            គំរូនេះតាមរចនាសម្ព័ន្ធរបាយការណ៍ពិតប្រាកដ — អ្វីដែលអ្នកវាយ នឹងបោះពុម្ពដូចនេះ។
          </p>
        </div>
      </div>
    </SectionCard>
  )

  const accountSection = (
    <div className="space-y-6">
      <SectionCard id="sec-account" title="គណនី" icon={<User className="h-5 w-5" aria-hidden />}>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-divider bg-paper p-4">
            <dt lang="km" className="text-[13px] font-bold leading-[1.7] text-text-body">អ៊ីមែល</dt>
            <dd className="mt-1 break-words text-sm text-text-heading">{email}</dd>
            <dd lang="km" className={`mt-1 text-[12px] font-semibold leading-[1.7] ${emailVerified ? 'text-success' : 'text-warning'}`}>
              {emailVerified ? '✓ បានផ្ទៀងផ្ទាត់' : 'មិនទាន់ផ្ទៀងផ្ទាត់'}
            </dd>
          </div>
          <div className="rounded-lg border border-divider bg-paper p-4">
            <dt lang="km" className="text-[13px] font-bold leading-[1.7] text-text-body">ចាកចេញពីគណនី</dt>
            <dd className="mt-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    // The draft carries this account's PII — it must not
                    // survive into the next sign-in on a shared computer.
                    sessionStorage.removeItem(STORAGE_KEYS.profileDraft)
                  } catch {}
                  await supabase.auth.signOut()
                  window.location.href = '/login'
                }}
                className="tap-target inline-flex cursor-pointer items-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 py-2.5 text-sm font-bold text-danger transition hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <LogOut aria-hidden className="h-4 w-4" /> ចាកចេញ
              </button>
            </dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard id="sec-password" title="ប្ដូរលេខសម្ងាត់ចូលប្រព័ន្ធ" icon={<ShieldCheck className="h-5 w-5" aria-hidden />}>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (newPassword !== confirmPassword) {
              notify.error('ពាក្យសម្ងាត់ថ្មី និងការបញ្ជាក់ មិនត្រូវគ្នាទេ')
              return
            }
            setPasswordBusy(true)
            const toastId = notify.loading('កំពុងប្ដូរពាក្យសម្ងាត់...')
            const result = await changePassword(currentPassword, newPassword)
            setPasswordBusy(false)
            if (result.error) {
              notify.settle(toastId, false, result.error)
              setLiveMessage('ប្ដូរពាក្យសម្ងាត់បរាជ័យ')
              return
            }
            notify.settle(toastId, true, 'ប្ដូរពាក្យសម្ងាត់ដោយជោគជ័យ')
            setLiveMessage('ប្ដូរពាក្យសម្ងាត់ដោយជោគជ័យ')
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
          }}
          className="grid max-w-2xl grid-cols-1 gap-5 sm:grid-cols-3"
        >
          {(
            [
              { label: 'ពាក្យសម្ងាត់បច្ចុប្បន្ន', value: currentPassword, set: setCurrentPassword, autoComplete: 'current-password' },
              { label: 'ពាក្យសម្ងាត់ថ្មី', value: newPassword, set: setNewPassword, autoComplete: 'new-password' },
              { label: 'បញ្ជាក់ពាក្យសម្ងាត់ថ្មី', value: confirmPassword, set: setConfirmPassword, autoComplete: 'new-password' },
            ] as const
          ).map(({ label, value, set, autoComplete }) => (
            <div key={label}>
              <label lang="km" htmlFor={`pw-${autoComplete}-${label}`} className="mb-1 block text-[13px] font-bold leading-[1.7] text-text-body">
                {label}
              </label>
              <div className="relative">
                <input
                  id={`pw-${autoComplete}-${label}`}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={autoComplete}
                  required
                  minLength={autoComplete === 'new-password' ? 6 : undefined}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'លាក់ពាក្យសម្ងាត់' : 'បង្ហាញពាក្យសម្ងាត់'}
                  className="tap-target absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-text-muted transition-colors hover:text-text-body focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {showPassword ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ))}
          <div className="sm:col-span-3">
            <p lang="km" className="mb-3 flex items-center gap-1 text-xs leading-[1.7] text-text-muted">
              <Info aria-hidden className="h-3 w-3" /> ត្រូវបញ្ចូលពាក្យសម្ងាត់បច្ចុប្បន្ន ដើម្បីបញ្ជាក់ថាជាអ្នកពិតប្រាកដ។
            </p>
            <button
              type="submit"
              disabled={passwordBusy}
              aria-busy={passwordBusy}
              className="tap-target inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-6 py-2.5 text-sm font-bold text-brand-contrast shadow-md transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {passwordBusy ? 'កំពុងប្ដូរ...' : 'ប្ដូរពាក្យសម្ងាត់'}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  )

  const TAB_CONTENT: Record<string, React.ReactNode> = {
    personal: personalSection,
    career: (
      <div className="space-y-6">
        {workSection}
        {civilSection}
        {trainingSection}
      </div>
    ),
    family: familySection,
    school: schoolSection,
    account: accountSection,
  }

  /** Completion badge for a whole tab (mobile section list). */
  const tabCompletion = (sections: SectionId[]) => {
    const filled = sections.reduce((n, s) => n + completion[s].filled, 0)
    const total = sections.reduce((n, s) => n + completion[s].total, 0)
    return { filled, total }
  }

  /* -------------------------------------------------------------- wizard */

  if (mode === 'wizard') {
    const steps = ['អត្តសញ្ញាណ', 'សាលា និងរបាយការណ៍', 'រួចរាល់']
    return (
      <FormCtx.Provider value={formCtxValue}>
      <div lang="km" className="mx-auto max-w-2xl px-4 py-10 text-text-heading">
        <h1 className="kh-moul text-xl leading-[1.9]">សូមស្វាគមន៍! រៀបចំគណនីរបស់អ្នក</h1>
        <p className="mt-1 text-sm leading-[1.7] text-text-muted">
          បំពេញត្រឹម ២ ជំហានខ្លី — ព័ត៌មានផ្សេងទៀតអាចបំពេញពេលក្រោយបាន។
        </p>

        <ol className="mt-6 flex items-center gap-2" aria-label="ជំហាន">
          {steps.map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                aria-current={wizardStep === i ? 'step' : undefined}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  i < wizardStep
                    ? 'bg-success-solid text-success-on-solid'
                    : i === wizardStep
                      ? 'bg-brand text-brand-contrast'
                      : 'border border-divider bg-paper text-text-muted'
                }`}
              >
                {i < wizardStep ? '✓' : toKhmerNumber(i + 1)}
              </span>
              <span className={`hidden text-[13px] leading-[1.7] sm:block ${i === wizardStep ? 'font-bold text-text-heading' : 'text-text-muted'}`}>
                {label}
              </span>
              {i < steps.length - 1 && <span aria-hidden className="h-px flex-1 bg-divider" />}
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-xl border border-divider bg-bg-surface p-6 shadow-sm">
          {wizardStep === 0 && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field k="surname" label="នាមត្រកូល" required placeholder="ឧ. រុន" />
              <Field k="name" label="នាមខ្លួន" required placeholder="ឧ. រស្មី" />
              <SelectField k="gender" label="ភេទ" options={['ប្រុស', 'ស្រី']} required placeholder="ជ្រើសរើសភេទ" />
              <Field k="phone" label="លេខទូរស័ព្ទ" type="tel" inputMode="tel" placeholder="012 345 678" />
            </div>
          )}
          {wizardStep === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field k="school_name" label="ឈ្មោះសាលា" required placeholder="សាលាបឋមសិក្សា..." />
                <Field k="class_name" label="ឈ្មោះថ្នាក់" placeholder="ឧ. ថ្នាក់ទី៦ «ក»" />
                <Field k="homeroom_teacher" label="ឈ្មោះគ្រូបន្ទុក" helper="បោះពុម្ពនៅកន្លែងចុះហត្ថលេខាគ្រូ។" />
                <Field k="manager_role" label="ងារនាយក" placeholder="ឧ. នាយកសាលា" />
                <Field k="director_name" label="ឈ្មោះនាយក" />
                <Field k="academic_year" label="ឆ្នាំសិក្សា" placeholder={`ឧ. ${getCurrentAcademicYear()}`} />
              </div>
              <ReportHeaderPreview values={previewValues} />
            </div>
          )}
          {wizardStep === 2 && (
            <div className="py-4 text-center">
              <CheckCircle2 aria-hidden className="mx-auto h-12 w-12 text-success" />
              <h2 className="kh-moul mt-3 text-lg leading-[1.9]">គណនីរួចរាល់ហើយ!</h2>
              <p className="mt-1 text-sm leading-[1.7] text-text-muted">
                អ្នកអាចបំពេញព័ត៌មានលម្អិត (មន្ត្រីរាជការ គ្រួសារ អាសយដ្ឋាន) នៅពេលណាក៏បាន។
              </p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            {wizardStep > 0 && wizardStep < 2 ? (
              <button
                type="button"
                onClick={() => setWizardStep((s) => s - 1)}
                className="tap-target cursor-pointer rounded-lg border border-divider bg-bg-surface px-5 py-2.5 text-sm font-bold text-text-body transition hover:bg-paper focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                ត្រឡប់ក្រោយ
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              disabled={saving}
              aria-busy={saving}
              onClick={async () => {
                if (wizardStep === 0) {
                  if (!str('surname') || !str('name') || !str('gender')) {
                    notify.error('សូមបំពេញ នាមត្រកូល នាមខ្លួន និងភេទ ជាមុនសិន')
                    return
                  }
                  if (await saveSections(['personal'])) {
                    if (!str('academic_year')) setF('academic_year', getCurrentAcademicYear())
                    setWizardStep(1)
                  }
                } else if (wizardStep === 1) {
                  if (!str('school_name')) {
                    notify.error('សូមបំពេញឈ្មោះសាលា ជាមុនសិន')
                    return
                  }
                  if (await saveSections(['school'])) setWizardStep(2)
                } else {
                  setMode('full')
                }
              }}
              className="tap-target cursor-pointer rounded-lg bg-brand px-8 py-2.5 text-sm font-bold text-brand-contrast shadow-md transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {wizardStep === 2 ? 'ចូលទៅកាន់ប្រវត្តិរូបពេញ' : saving ? 'កំពុងរក្សាទុក...' : 'រក្សាទុក និងបន្ត'}
            </button>
          </div>
        </div>

        <div role="status" aria-live="polite" className="sr-only">{liveMessage}</div>
      </div>
      </FormCtx.Provider>
    )
  }

  /* ------------------------------------------------------------ full UI */

  return (
    <FormCtx.Provider value={formCtxValue}>
    <div lang="km" className="relative text-text-heading">
      <div aria-hidden className="absolute inset-x-0 top-0 z-0 h-[160px] bg-gradient-to-br from-[var(--brand)] to-[var(--brand-500)]" />

      <div className={`relative z-10 mx-auto max-w-6xl px-4 py-8 ${anyDirty ? 'pb-32' : ''}`}>
        <div className="mb-6 text-white">
          <h1 className="kh-moul text-xl leading-[1.9] text-white/95">ព័ត៌មានគណនី</h1>
          <p className="mt-0.5 text-sm leading-[1.7] text-white/80">
            ព័ត៌មាននៅទំព័រនេះ បោះពុម្ពលើរបាយការណ៍ វិញ្ញាបនបត្រ និងឯកសារផ្លូវការទាំងអស់។
          </p>
        </div>

        {/* Desktop tabs */}
        <div
          role="tablist"
          aria-label="ផ្នែកនៃប្រវត្តិរូប"
          className="mb-6 hidden gap-1 rounded-xl border border-divider bg-bg-surface p-1.5 shadow-sm lg:flex"
          onKeyDown={(e) => {
            const idx = TABS.findIndex((t) => t.id === activeTab)
            let next = -1
            if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length
            if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length
            if (e.key === 'Home') next = 0
            if (e.key === 'End') next = TABS.length - 1
            if (next >= 0) {
              e.preventDefault()
              setActiveTab(TABS[next].id)
              tabRefs.current[next]?.focus()
            }
          }}
        >
          {TABS.map((tab, i) => {
            const selected = activeTab === tab.id
            const c = tabCompletion(tab.sections)
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                ref={(el) => { tabRefs.current[i] = el }}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                className={`tap-target flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold leading-[1.7] transition focus-visible:ring-2 focus-visible:ring-focus-ring ${
                  selected ? 'bg-brand text-brand-contrast shadow-sm' : 'text-text-body hover:bg-paper'
                }`}
              >
                <Icon aria-hidden className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
                {tab.sections.length > 0 && c.filled < c.total && (
                  <span
                    lang="km"
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${selected ? 'bg-white/20' : 'bg-paper text-text-muted'}`}
                  >
                    {toKhmerNumber(c.filled)}/{toKhmerNumber(c.total)}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Mobile: vertical section list with anchors + badges (no horizontal-scroll tabs) */}
        <nav aria-label="ផ្នែកនៃប្រវត្តិរូប" className="mb-6 rounded-xl border border-divider bg-bg-surface p-2 shadow-sm lg:hidden">
          <ul className="divide-y divide-divider">
            {TABS.map((tab) => {
              const c = tabCompletion(tab.sections)
              const Icon = tab.icon
              return (
                <li key={tab.id}>
                  <a
                    href={`#panel-${tab.id}`}
                    className="tap-target flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold leading-[1.7] text-text-body transition hover:bg-paper focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <Icon aria-hidden className="h-4 w-4 shrink-0 text-brand" />
                    <span className="min-w-0 flex-1">{tab.label}</span>
                    {tab.sections.length > 0 && (
                      <span
                        lang="km"
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                          c.filled >= c.total
                            ? 'border-success/30 bg-success/10 text-success'
                            : 'border-divider bg-paper text-text-muted'
                        }`}
                      >
                        {toKhmerNumber(c.filled)}/{toKhmerNumber(c.total)}
                      </span>
                    )}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Panels: desktop shows the active tab; mobile stacks everything. */}
        <div className="space-y-8">
          {TABS.map((tab) => (
            <div
              key={tab.id}
              id={`panel-${tab.id}`}
              role={isDesktop ? 'tabpanel' : undefined}
              aria-labelledby={isDesktop ? `tab-${tab.id}` : undefined}
              className={`scroll-mt-24 ${activeTab === tab.id ? '' : 'lg:hidden'}`}
            >
              <h2 lang="km" className="kh-moul mb-3 text-base leading-[1.9] text-text-heading lg:sr-only">
                {tab.label}
              </h2>
              {TAB_CONTENT[tab.id]}
            </div>
          ))}
        </div>
      </div>

      <StickySaveBar
        dirtyLabels={dirtySections.map((s) => SECTION_LABELS[s])}
        saving={saving}
        onSave={() => void saveSections(dirtySections)}
        onCancel={discardChanges}
      />

      <ConfirmDialog
        open={conflictOpen}
        tone="warning"
        title="ទិន្នន័យត្រូវបានកែប្រែពីឧបករណ៍ផ្សេង"
        message="គណនីនេះទើបរក្សាទុកពីឧបករណ៍ផ្សេង។ រក្សាទុកបន្ត នឹងជំនួសការកែប្រែនោះដោយអ្វីដែលអ្នកវាយនៅទីនេះ។"
        confirmLabel="រក្សាទុកជំនួស"
        cancelLabel="បោះបង់"
        loading={saving}
        onConfirm={async () => {
          const ok = await saveSections(dirtySections, true)
          if (ok) setConflictOpen(false)
        }}
        onCancel={() => setConflictOpen(false)}
      />

      <div role="status" aria-live="polite" className="sr-only">{liveMessage}</div>
    </div>
    </FormCtx.Provider>
  )
}
