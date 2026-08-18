/**
 * Carrying the education level chosen on `/choose-level` across sign-in.
 *
 * Before authentication there is no `auth.uid()` and no school, so the choice
 * cannot be persisted anywhere authoritative — `education_levels` rows are
 * per-school and do not exist yet. It rides in sessionStorage instead: per-tab,
 * survives the OAuth full-page round trip, gone when the tab closes.
 *
 * This is a navigation hint, never a trust boundary. The level step merely
 * *preselects* from it, `chooseEducationLevel` re-validates the key against
 * the curriculum ladder server-side, and the rows it writes are what the app
 * actually reads. A tampered value can at worst preselect a different card.
 */

import { STORAGE_KEYS } from '@/lib/constants/storage'
import { levelByKey, type EducationLevelKey } from '@/lib/onboarding/curriculum'

/** The pending choice, or null when absent, invalid, or not in a browser. */
export function readPendingLevel(): EducationLevelKey | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.pendingLevel)
    return raw && levelByKey(raw) ? (raw as EducationLevelKey) : null
  } catch {
    // Storage can throw under strict privacy settings; a lost preselect is fine.
    return null
  }
}

export function writePendingLevel(key: EducationLevelKey): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEYS.pendingLevel, key)
  } catch {
    // Losing the hint only costs one extra tap on the level step.
  }
}

/** One-shot: the hint is consumed the moment a signed-in step restores it. */
export function clearPendingLevel(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(STORAGE_KEYS.pendingLevel)
  } catch {
    // Nothing to do — the value dies with the tab anyway.
  }
}
