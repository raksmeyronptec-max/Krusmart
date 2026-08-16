/**
 * Kept as a re-export so the portal's imports stay put.
 *
 * The map moved to `lib/constants/subjects.ts` in Phase 5 because the teacher
 * app's student detail view needs the same labels, and a `(main)` page reaching
 * into `app/parent/` for a constant would be the wrong dependency direction.
 */
export { STANDARD_SUBJECT_LABELS, subjectLabel } from '@/lib/constants/subjects'
