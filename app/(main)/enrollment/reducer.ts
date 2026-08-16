import { useReducer, useEffect } from 'react'

export interface EnrollmentState {
  photoUrl: string
  studentId: string
  grade: string
  studentName: string
  latinName: string
  gender: string
  dob: string
  calculatedAge: string
  phone: string
  
  birthProvince: string
  birthDistrict: string
  birthCommune: string
  birthVillage: string
  
  sameAsBirth: boolean
  currProvince: string
  currDistrict: string
  currCommune: string
  currVillage: string
  
  isNewStudent: string
  isRepeater: string
  orphanStatus: string
  isDisabled: string
  poorStatus: string
  isEquity: string
  isScholarship: string
  
  fatherName: string
  fatherJob: string
  motherName: string
  motherJob: string
  guardianName: string
  guardianJob: string
  
  ethnicity: string
  specialFeatures: string
  otherRemarks: string
  
  errors: Record<string, string>
}

export const initialState: EnrollmentState = {
  photoUrl: '',
  studentId: '',
  grade: '',
  studentName: '',
  latinName: '',
  gender: '',
  dob: '',
  calculatedAge: '',
  phone: '',
  
  birthProvince: '',
  birthDistrict: '',
  birthCommune: '',
  birthVillage: '',
  
  sameAsBirth: false,
  currProvince: '',
  currDistrict: '',
  currCommune: '',
  currVillage: '',
  
  isNewStudent: 'ទេ',
  isRepeater: 'ទេ',
  orphanStatus: 'ទេ',
  isDisabled: 'ទេ',
  poorStatus: 'គ្មាន',
  isEquity: 'ទេ',
  isScholarship: 'ទេ',
  
  fatherName: '',
  fatherJob: '',
  motherName: '',
  motherJob: '',
  guardianName: '',
  guardianJob: '',
  
  ethnicity: '',
  specialFeatures: '',
  otherRemarks: '',
  
  errors: {},
}

/** Everything a form control can set. `errors` is managed by its own actions. */
export type EnrollmentField = Exclude<keyof EnrollmentState, 'errors'>

/**
 * The string-valued fields — everything a text input or `<select>` drives.
 *
 * The generic change handler reads `e.target.name`, which is only ever the name
 * of a string field, so this is what that cast narrows to.
 */
export type EnrollmentTextField = {
  [K in EnrollmentField]: EnrollmentState[K] extends string ? K : never
}[EnrollmentField]

/** The boolean-valued fields. Currently just `sameAsBirth`. */
export type EnrollmentFlagField = {
  [K in EnrollmentField]: EnrollmentState[K] extends boolean ? K : never
}[EnrollmentField]

export type EnrollmentAction =
  /*
   * Split by value type rather than typed per field.
   *
   * The obvious alternative — mapping over the keys to pair each field name with
   * its own value type — types literal call sites beautifully but rejects the
   * generic `handleChange`, which holds the field name in a variable: TypeScript
   * cannot prove which member of a distributed union that variable selects.
   * Two members keyed on the value type carry the same guarantee that mattered
   * (a boolean field cannot be set to a string) and stay usable from a handler.
   */
  | { type: 'SET_FIELD'; field: EnrollmentTextField; value: string }
  | { type: 'SET_FLAG'; field: EnrollmentFlagField; value: boolean }
  | { type: 'SET_ERROR'; field: string; error: string }
  | { type: 'CLEAR_ERROR'; field: string }
  | { type: 'CLEAR_ALL_ERRORS' }
  | { type: 'RESET' }
  | { type: 'RESTORE_DRAFT'; state: EnrollmentState }
  | { type: 'COPY_ADDRESS' }
  | { type: 'COPY_FATHER_TO_GUARDIAN' }

export function enrollmentReducer(state: EnrollmentState, action: EnrollmentAction): EnrollmentState {
  switch (action.type) {
    case 'SET_FIELD': {
      const newState = { ...state, [action.field]: action.value }
      // Clear error for this field when it changes
      if (state.errors[action.field]) {
        const newErrors = { ...state.errors }
        delete newErrors[action.field]
        newState.errors = newErrors
      }
      return newState
    }
    // A flag has no validation error to clear — nothing about a checkbox can be
    // typed wrong — so this is the plain assignment `SET_FIELD` cannot be.
    case 'SET_FLAG':
      return { ...state, [action.field]: action.value }
    case 'SET_ERROR':
      return { ...state, errors: { ...state.errors, [action.field]: action.error } }
    case 'CLEAR_ERROR': {
      const newErrors = { ...state.errors }
      delete newErrors[action.field]
      return { ...state, errors: newErrors }
    }
    case 'CLEAR_ALL_ERRORS':
      return { ...state, errors: {} }
    case 'RESET':
      return { ...initialState }
    case 'RESTORE_DRAFT':
      return { ...action.state, errors: {} } // Don't restore errors
    case 'COPY_ADDRESS':
      return {
        ...state,
        sameAsBirth: true,
        currProvince: state.birthProvince,
        currDistrict: state.birthDistrict,
        currCommune: state.birthCommune,
        currVillage: state.birthVillage,
      }
    case 'COPY_FATHER_TO_GUARDIAN':
      return {
        ...state,
        guardianName: state.fatherName,
        guardianJob: state.fatherJob,
      }
    default:
      return state
  }
}

export function useAutoSave(state: EnrollmentState, key: string, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return
    
    // Don't save empty initial state
    const hasData = Object.entries(state).some(([k, v]) => 
      k !== 'errors' && k !== 'isNewStudent' && k !== 'isRepeater' && k !== 'orphanStatus' && k !== 'isDisabled' && k !== 'poorStatus' && k !== 'isEquity' && k !== 'isScholarship' && k !== 'sameAsBirth' && v !== ''
    )
    
    if (!hasData) return

    const timeoutId = setTimeout(() => {
      localStorage.setItem(key, JSON.stringify(state))
    }, 2000)

    return () => clearTimeout(timeoutId)
  }, [state, key, enabled])
}

export function useBeforeUnload(shouldWarn: boolean) {
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (shouldWarn) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [shouldWarn])
}
