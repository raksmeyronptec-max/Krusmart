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
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]
