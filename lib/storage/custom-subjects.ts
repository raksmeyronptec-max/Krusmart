import { STORAGE_KEYS } from '@/lib/constants/storage'
import type { CustomSubjectColumn, CustomSubjectScope } from '@/lib/types'

/**
 * The **legacy** `localStorage` store for teacher-defined subjects.
 *
 * Since migration 00012 the subjects live in Supabase (`custom_subjects`,
 * server actions in `app/(main)/score/custom-subjects/actions.ts`). This module
 * survives for one job: reading what an existing browser already has, so it can
 * be imported once into the database.
 *
 * Nothing writes here any more. The stored value is deliberately left in place
 * after an import rather than cleared — an import that fails can be retried,
 * and a tab still running an older build keeps working.
 */

export type { CustomSubjectColumn, CustomSubjectScope } from '@/lib/types'

/** The shape older builds wrote. `type` is this store's name for `scope`. */
export interface LegacyCustomSubject {
  id: string
  name: string
  /** Absent on the oldest rows, which both grids treated as `'both'`. */
  type?: CustomSubjectScope
  columns: CustomSubjectColumn[]
}

/**
 * Read the browser's stored subjects.
 *
 * Returns `[]` on the server, when nothing is stored, or when the value is
 * corrupt — callers used to let a malformed value throw out of `JSON.parse`
 * inside a `useEffect`.
 */
export function readLegacyCustomSubjects(): LegacyCustomSubject[] {
  if (typeof window === 'undefined') return []

  const raw = window.localStorage.getItem(STORAGE_KEYS.customSubjects)
  if (!raw) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as LegacyCustomSubject[]) : []
  } catch {
    return []
  }
}

/** Normalise a legacy row into the payload `importCustomSubjects` accepts. */
export function toImportPayload(s: LegacyCustomSubject): {
  name: string
  scope: CustomSubjectScope
  columns: CustomSubjectColumn[]
} {
  return {
    name: s.name,
    scope: s.type ?? 'both',
    columns: Array.isArray(s.columns) ? s.columns : [],
  }
}

/** True when `subject` should appear in the given grid. */
export function appliesTo(
  subject: { scope?: CustomSubjectScope; type?: CustomSubjectScope },
  scope: Exclude<CustomSubjectScope, 'both'>,
): boolean {
  const value = subject.scope ?? subject.type
  return !value || value === 'both' || value === scope
}
