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

export type EnrollmentAction =
  | { type: 'SET_FIELD'; field: keyof EnrollmentState; value: any }
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
      if (state.errors[action.field as string]) {
        const newErrors = { ...state.errors }
        delete newErrors[action.field as string]
        newState.errors = newErrors
      }
      return newState
    }
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
