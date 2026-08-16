/**
 * The enrollment form as data.
 *
 * The page used to keep the text fields uncontrolled and read them back out of
 * `formRef.current.elements` during render. Three things followed from that,
 * all of them visible to a teacher:
 *
 *   * the progress rail never moved while typing, because an uncontrolled
 *     input does not re-render anything;
 *   * the autosaved draft held only the date, photo and address — a restored
 *     draft came back without the student's name, and said nothing about it;
 *   * the "you have unsaved work" guard tested three fields, so a fully typed
 *     form could be closed without a warning.
 *
 * Making the values state fixes all three at once, and lets the derived numbers
 * (progress, per-section status, validity) be computed rather than sampled.
 *
 * `FIELD_NAMES` is deliberately the exact set of `formData.get(...)` keys read
 * by `createStudent` in `./actions.ts`, so the submit path is a plain loop and
 * the two cannot drift apart.
 */

import type { LucideIcon } from 'lucide-react'
import { Award, FileText, MapPin, UserPlus, Users } from 'lucide-react'
import { STORAGE_KEYS } from '@/lib/constants/storage'
import { calculateAge } from '@/lib/utils/date'
import { fromKhmerNumber } from '@/lib/utils/khmer-num'

export const FIELD_NAMES = [
  'studentId', 'grade', 'studentName', 'latinName', 'gender', 'dob', 'phone',
  'birthProvince', 'birthDistrict', 'birthCommune', 'birthVillage',
  'currProvince', 'currDistrict', 'currCommune', 'currVillage',
  'isNewStudent', 'isRepeater', 'orphanStatus', 'isDisabled', 'poorStatus',
  'isEquity', 'isScholarship',
  'fatherName', 'fatherJob', 'motherName', 'motherJob', 'guardianName', 'guardianJob',
  'ethnicity', 'specialFeatures', 'otherRemarks', 'photoUrl',
] as const

export type FieldName = (typeof FIELD_NAMES)[number]
export type EnrollmentValues = Record<FieldName, string>
export type FieldErrors = Partial<Record<FieldName, string>>

/** `createStudent` compares against these exact strings — do not translate them here. */
export const YES = 'បាទ/ចាស'
export const NO = 'ទេ'
export const YES_NO = [NO, YES]
export const ORPHAN_OPTIONS = [NO, 'កំព្រាឪពុក', 'កំព្រាម្តាយ', 'កំព្រាទាំងពីរ']
export const POOR_OPTIONS = ['គ្មាន', 'ក្រ១', 'ក្រ២']

export const INITIAL_VALUES: EnrollmentValues = {
  studentId: '', grade: '', studentName: '', latinName: '', gender: '', dob: '', phone: '',
  birthProvince: '', birthDistrict: '', birthCommune: '', birthVillage: '',
  currProvince: '', currDistrict: '', currCommune: '', currVillage: '',
  isNewStudent: NO, isRepeater: NO, orphanStatus: NO, isDisabled: NO,
  poorStatus: 'គ្មាន', isEquity: NO, isScholarship: NO,
  fatherName: '', fatherJob: '', motherName: '', motherJob: '',
  guardianName: '', guardianJob: '',
  ethnicity: '', specialFeatures: '', otherRemarks: '', photoUrl: '',
}

/* ─── Sections ─── */

export type SectionId =
  | 'student-details' | 'addresses' | 'student-status' | 'guardians' | 'additional-details'

export interface SectionMeta {
  id: SectionId
  number: string
  label: string
  title: string
  description: string
  icon: LucideIcon
  /** Fields that gate submission. */
  required: FieldName[]
  /** Fields that count towards "how much of this section is filled in". */
  optional: FieldName[]
}

export const SECTIONS: SectionMeta[] = [
  {
    id: 'student-details', number: '១', label: 'ព័ត៌មានសិស្ស',
    title: 'ព័ត៌មានសិស្ស',
    description: 'ព័ត៌មានមានសញ្ញា * គឺចាំបាច់សម្រាប់បង្កើតកំណត់ត្រាសិស្ស។',
    icon: UserPlus,
    required: ['studentId', 'grade', 'studentName', 'gender', 'dob'],
    optional: ['latinName', 'phone', 'photoUrl'],
  },
  {
    id: 'addresses', number: '២', label: 'អាសយដ្ឋាន',
    title: 'ព័ត៌មានទីតាំង និងអាសយដ្ឋាន',
    description: 'ជ្រើសរើសតាមលំដាប់ រាជធានី/ខេត្ត → ក្រុង/ស្រុក/ខណ្ឌ → ឃុំ/សង្កាត់ → ភូមិ។',
    icon: MapPin,
    required: ['birthProvince', 'birthDistrict', 'birthCommune', 'birthVillage'],
    optional: ['currProvince', 'currDistrict', 'currCommune', 'currVillage'],
  },
  {
    id: 'student-status', number: '៣', label: 'ស្ថានភាព',
    title: 'ស្ថានភាព និងអាហារូបករណ៍',
    description: 'កំណត់ស្ថានភាពសិស្ស ដើម្បីប្រើក្នុងរបាយការណ៍ និងការគាំទ្រសិស្ស។',
    icon: Award,
    required: [],
    optional: [],
  },
  {
    id: 'guardians', number: '៤', label: 'អាណាព្យាបាល',
    title: 'ព័ត៌មានឪពុកម្តាយ និងអាណាព្យាបាល',
    description: 'បញ្ចូលព័ត៌មានទំនាក់ទំនងដែលពាក់ព័ន្ធតាមដែលមាន។',
    icon: Users,
    required: [],
    optional: ['fatherName', 'fatherJob', 'motherName', 'motherJob', 'guardianName', 'guardianJob'],
  },
  {
    id: 'additional-details', number: '៥', label: 'បន្ថែម',
    title: 'ព័ត៌មានបន្ថែម',
    description: 'ព័ត៌មាននេះមិនចាំបាច់ទេ ប៉ុន្តែអាចជួយគាំទ្រការតាមដានសិស្សបានល្អ។',
    icon: FileText,
    required: [],
    optional: ['ethnicity', 'specialFeatures', 'otherRemarks'],
  },
]

export const REQUIRED_FIELDS: FieldName[] = SECTIONS.flatMap((s) => s.required)

/* ─── Validation ─── */

const REQUIRED_MESSAGE = 'វាលនេះត្រូវការបំពេញ'

/**
 * Validate one field in the context of the whole form.
 *
 * Beyond "not empty" this catches the two mistakes that actually reach the
 * database: a birth year typed as the current year (a five-year-old entered as
 * a newborn), and a phone number that is too short to dial. Both are silent
 * today — the record saves and the error surfaces months later on a report.
 */
export function validateField(name: FieldName, values: EnrollmentValues): string | undefined {
  const value = values[name]?.trim() ?? ''

  if (!value) return REQUIRED_FIELDS.includes(name) ? REQUIRED_MESSAGE : undefined

  if (name === 'dob') {
    const age = calculateAge(value)
    if (age === null) return 'ថ្ងៃខែឆ្នាំកំណើតមិនត្រឹមត្រូវ'
    if (age < 0) return 'ថ្ងៃខែឆ្នាំកំណើតមិនអាចនៅថ្ងៃអនាគតបានទេ'
    if (age > 100) return 'សូមពិនិត្យឆ្នាំកំណើតឡើងវិញ'
  }

  if (name === 'phone') {
    const digits = fromKhmerNumber(value).replace(/\D/g, '')
    if (digits.length < 8 || digits.length > 11) return 'លេខទូរស័ព្ទគួរមាន ៨ ដល់ ១១ ខ្ទង់'
  }

  return undefined
}

/** Every error on the form. Used on submit and to decide whether Save is enabled. */
export function validateAll(values: EnrollmentValues): FieldErrors {
  const errors: FieldErrors = {}
  const checked = new Set<FieldName>([...REQUIRED_FIELDS, 'dob', 'phone'])
  checked.forEach((name) => {
    const message = validateField(name, values)
    if (message) errors[name] = message
  })
  return errors
}

/* ─── Derived progress ─── */

export const isFilled = (values: EnrollmentValues, name: FieldName) =>
  (values[name] ?? '').trim() !== ''

export type SectionState = 'error' | 'done' | 'partial' | 'todo'

export interface SectionProgress {
  requiredDone: number
  requiredTotal: number
  optionalDone: number
  optionalTotal: number
  errorCount: number
  state: SectionState
}

/**
 * Progress for one section.
 *
 * A section with no required fields is never "done" — it is `partial` once
 * anything is filled in, and `todo` otherwise. The previous version treated an
 * empty optional section as complete, which is why the form opened claiming it
 * was already 60% finished.
 */
export function sectionProgress(
  section: SectionMeta,
  values: EnrollmentValues,
  errors: FieldErrors
): SectionProgress {
  const requiredDone = section.required.filter((f) => isFilled(values, f)).length
  const optionalDone = section.optional.filter((f) => isFilled(values, f)).length
  const errorCount = [...section.required, ...section.optional].filter((f) => errors[f]).length

  let state: SectionState = 'todo'
  if (errorCount > 0) state = 'error'
  else if (section.required.length > 0) state = requiredDone === section.required.length ? 'done' : requiredDone > 0 ? 'partial' : 'todo'
  else if (optionalDone > 0) state = 'partial'

  return {
    requiredDone,
    requiredTotal: section.required.length,
    optionalDone,
    optionalTotal: section.optional.length,
    errorCount,
    state,
  }
}

/** Share of the nine mandatory fields that are filled — the number that gates Save. */
export function requiredProgress(values: EnrollmentValues) {
  const done = REQUIRED_FIELDS.filter((f) => isFilled(values, f)).length
  return { done, total: REQUIRED_FIELDS.length, percent: Math.round((done / REQUIRED_FIELDS.length) * 100) }
}

export const isDirty = (values: EnrollmentValues) =>
  FIELD_NAMES.some((name) => values[name] !== INITIAL_VALUES[name])

/* ─── Reducer ─── */

/**
 * Choosing a province invalidates the district under it, and so on down the
 * chain — otherwise a teacher who corrects the province keeps a village that
 * does not belong to it.
 */
const CASCADE: Partial<Record<FieldName, FieldName[]>> = {
  birthProvince: ['birthDistrict', 'birthCommune', 'birthVillage'],
  birthDistrict: ['birthCommune', 'birthVillage'],
  birthCommune: ['birthVillage'],
  currProvince: ['currDistrict', 'currCommune', 'currVillage'],
  currDistrict: ['currCommune', 'currVillage'],
  currCommune: ['currVillage'],
}

const MIRROR: Partial<Record<FieldName, FieldName>> = {
  birthProvince: 'currProvince',
  birthDistrict: 'currDistrict',
  birthCommune: 'currCommune',
  birthVillage: 'currVillage',
}

export interface EnrollmentState {
  values: EnrollmentValues
  errors: FieldErrors
  /** Mirrors the birth address into the current address as it is typed. */
  sameAsBirth: boolean
}

export const INITIAL_STATE: EnrollmentState = {
  values: INITIAL_VALUES,
  errors: {},
  sameAsBirth: false,
}

export type EnrollmentAction =
  | { type: 'set'; name: FieldName; value: string }
  | { type: 'blur'; name: FieldName }
  | { type: 'sameAsBirth'; value: boolean }
  | { type: 'setErrors'; errors: FieldErrors }
  | { type: 'restore'; draft: EnrollmentDraft }
  | { type: 'reset' }

function applyMirror(values: EnrollmentValues, sameAsBirth: boolean): EnrollmentValues {
  if (!sameAsBirth) return values
  return {
    ...values,
    currProvince: values.birthProvince,
    currDistrict: values.birthDistrict,
    currCommune: values.birthCommune,
    currVillage: values.birthVillage,
  }
}

export function enrollmentReducer(state: EnrollmentState, action: EnrollmentAction): EnrollmentState {
  switch (action.type) {
    case 'set': {
      const values: EnrollmentValues = { ...state.values, [action.name]: action.value }
      CASCADE[action.name]?.forEach((child) => { values[child] = '' })
      if (state.sameAsBirth && MIRROR[action.name]) {
        values[MIRROR[action.name]!] = action.value
        CASCADE[MIRROR[action.name]!]?.forEach((child) => { values[child] = '' })
      }

      // Clear an error the moment the field becomes valid, rather than waiting
      // for the next blur — the teacher gets confirmation while still looking
      // at the field they were fixing.
      const errors = { ...state.errors }
      let changed = false
      Object.keys(values).forEach((key) => {
        const name = key as FieldName
        if (errors[name] && values[name] !== state.values[name] && !validateField(name, values)) {
          delete errors[name]
          changed = true
        }
      })

      return { ...state, values, errors: changed ? errors : state.errors }
    }

    case 'blur': {
      const message = validateField(action.name, state.values)
      if (message === state.errors[action.name]) return state
      const errors = { ...state.errors }
      if (message) errors[action.name] = message
      else delete errors[action.name]
      return { ...state, errors }
    }

    case 'sameAsBirth':
      return {
        ...state,
        sameAsBirth: action.value,
        values: applyMirror(state.values, action.value),
      }

    case 'setErrors':
      return { ...state, errors: action.errors }

    case 'restore':
      return {
        values: { ...INITIAL_VALUES, ...action.draft.values },
        errors: {},
        sameAsBirth: action.draft.sameAsBirth,
      }

    case 'reset':
      return INITIAL_STATE

    default:
      return state
  }
}

/* ─── Draft persistence ─── */

export interface EnrollmentDraft {
  v: 2
  savedAt: number
  values: EnrollmentValues
  sameAsBirth: boolean
}

/**
 * Read a draft worth offering back.
 *
 * Returns `null` for an untouched draft on purpose: the old version wrote an
 * empty object two seconds after the page mounted, so merely visiting the form
 * left a "draft" that greeted the teacher on every later visit and restored
 * nothing.
 */
export function readDraft(): EnrollmentDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.enrollmentDraft)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<EnrollmentDraft>
    if (parsed?.v !== 2 || !parsed.values) return null
    const values = { ...INITIAL_VALUES, ...parsed.values }
    if (!isDirty(values)) return null
    return {
      v: 2,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
      values,
      sameAsBirth: !!parsed.sameAsBirth,
    }
  } catch {
    return null
  }
}

export function writeDraft(values: EnrollmentValues, sameAsBirth: boolean): number | null {
  try {
    const savedAt = Date.now()
    const draft: EnrollmentDraft = { v: 2, savedAt, values, sameAsBirth }
    localStorage.setItem(STORAGE_KEYS.enrollmentDraft, JSON.stringify(draft))
    cachedDraft = draft
    emitDraftChange()
    return savedAt
  } catch {
    // Quota exceeded — most likely a large inline photo. The form still works.
    return null
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(STORAGE_KEYS.enrollmentDraft)
  } catch {
    /* ignore */
  }
  cachedDraft = null
  emitDraftChange()
}

/* ─── The draft as an external store ─── */

/**
 * `localStorage` cannot be read while the server renders, and the usual
 * `useState(null)` + `useEffect(() => setState(read()))` pair sets state
 * synchronously inside an effect — a cascading render that React's compiler
 * rejects. `useSyncExternalStore` says the same thing in one pass: the server
 * snapshot is "no draft", the client snapshot is whatever is on disk.
 *
 * The snapshot is cached because `getSnapshot` must return a stable value
 * between notifications; parsing the JSON afresh on every render would hand
 * React a new object each time and spin.
 */
let cachedDraft: EnrollmentDraft | null | undefined
const draftListeners = new Set<() => void>()

function emitDraftChange() {
  draftListeners.forEach((listener) => listener())
}

export function subscribeToDraft(listener: () => void) {
  draftListeners.add(listener)
  return () => { draftListeners.delete(listener) }
}

export function getDraftSnapshot(): EnrollmentDraft | null {
  if (cachedDraft === undefined) cachedDraft = readDraft()
  return cachedDraft
}

export function getServerDraftSnapshot(): EnrollmentDraft | null {
  return null
}

/** The payload `createStudent` expects, built from state rather than from the DOM. */
export function toFormData(values: EnrollmentValues): FormData {
  const fd = new FormData()
  FIELD_NAMES.forEach((name) => fd.append(name, values[name].trim()))
  return fd
}
