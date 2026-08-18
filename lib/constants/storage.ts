/**
 * Every `localStorage` key the app reads or writes.
 *
 * Several features persist here instead of in Supabase (see CLAUDE.md), so
 * these strings are effectively a schema. Import the constant rather than
 * retyping the literal — a typo silently creates a second, empty store.
 */
export const STORAGE_KEYS = {
  /** Inventory rows for `/inventory`. */
  inventoryItems: 'inventoryItems',
  /** User-defined subject groups, shared by `score/enter` and `score/total`. */
  customSubjects: 'custom_subjects',
  /** Seating grid dimensions for `attendance/layout`. */
  seatingConfig: 'seatingConfig',
  /** Seat id → student id assignments for `attendance/layout`. */
  seatingLayout: 'seatingLayout',
  /** Last page the user reached in `/tutorial`. */
  lastTutorialPage: 'ptec_last_tutorial_page',
  /** Offline-friendly copy of the roster. */
  studentsCache: 'krusmart_students_cache',
  /**
   * Unsaved `/enrollment` form. A teacher fills this in over several minutes,
   * often on a phone that backgrounds the tab; losing the typing to a reload
   * means re-reading the whole paper form.
   */
  enrollmentDraft: 'krusmart_enrollment_draft',
  /**
   * Unsaved `/profile` edits, held in sessionStorage (not localStorage — the
   * draft can carry PII, so it must not outlive the tab). Restored after a
   * session-expiry redirect so re-login never loses typed input.
   */
  profileDraft: 'krusmart_profile_draft',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]
