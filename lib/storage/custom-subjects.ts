import { STORAGE_KEYS } from '@/lib/constants/storage'

/**
 * User-defined subjects, persisted in `localStorage` rather than Supabase and
 * shared by `score/enter` and `score/total`.
 *
 * Both clients previously declared their own `CustomSubject` type that did not
 * match what they read: the type said columns carried `name`, but `score/total`
 * reads `col.label`, and neither type declared the `type` discriminator both
 * files branch on. The shape below follows the actual reads.
 */

export interface CustomSubjectColumn {
  id: string
  label: string
  /** Present on rows written by older builds of the subject editor. */
  name?: string
  width?: string
  mode?: string
}

/** Which score grid a custom subject appears in. */
export type CustomSubjectScope = 'monthly' | 'semester' | 'both'

export interface CustomSubject {
  id: string
  name: string
  /** Absent on legacy rows, which both grids treat as `'both'`. */
  type?: CustomSubjectScope
  columns: CustomSubjectColumn[]
}

/**
 * Read the stored subjects. Returns `[]` on the server, when nothing is stored,
 * or when the stored value is corrupt — callers previously let a malformed
 * value throw out of `JSON.parse` inside a `useEffect`.
 */
export function readCustomSubjects(): CustomSubject[] {
  if (typeof window === 'undefined') return []

  const raw = window.localStorage.getItem(STORAGE_KEYS.customSubjects)
  if (!raw) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CustomSubject[]) : []
  } catch {
    return []
  }
}

/** Persist the subject list. */
export function writeCustomSubjects(subjects: CustomSubject[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEYS.customSubjects, JSON.stringify(subjects))
}

/** True when `subject` should appear in the given grid. */
export function appliesTo(subject: CustomSubject, scope: Exclude<CustomSubjectScope, 'both'>): boolean {
  return !subject.type || subject.type === 'both' || subject.type === scope
}
