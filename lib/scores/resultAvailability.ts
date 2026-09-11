// Relative, with the extension, so node can load this module directly — the
// convention `lib/scores/workspace.ts` and `lib/utils/classHref.ts` follow.

/**
 * Whether a results screen has anything to show, and what to say when it does not.
 *
 * ── The defect this closes (Phase 14 F14-3 / F14-4) ───────────────────────
 *
 * `/ranking` had no guard at all. Picking a month for a class with no pupils
 * rendered the COMPLETE ministry sheet: royal letterhead, school name, the
 * title តារាងចំណាត់ថ្នាក់សិស្ស, a totals block reading `0 នាក់ ស្រី 0 នាក់
 * 0.00%`, and signature lines for the នាយកសាលា and the គ្រូបន្ទុកថ្នាក់ — with
 * print and Excel live beside it. A teacher could hand in a signed, official,
 * empty document, and nothing on the way there said it was empty.
 *
 * Its sibling `/honor-roll` already did the right thing: it refuses, and
 * distinguishes "no marks yet" from "nobody cleared the bar", which are
 * different answers leading to different actions. Two screens in one module,
 * one question, opposite behaviour.
 *
 * So the rule is declared once, here, and the screens render it. Seven results
 * screens had zero `EmptyState` and zero `role="status"` between them while
 * fifteen entry screens used both — this is the half they were missing.
 *
 * ── What it deliberately does NOT decide ──────────────────────────────────
 *
 * Eligibility. "Nobody met the honour criteria" is `lib/scores/honor.ts`'s
 * answer and stays there: a class CAN have a full set of marks and no
 * honourees, which is a result, not an absence. This module answers the
 * question before that one — is there anything to compute at all.
 *
 * Pure and isomorphic; `scripts/verify-documents.mts` runs it. Keep it free of
 * `server-only` and of `next/*`.
 */

export type ResultAvailability = 'no-roster' | 'no-marks' | 'ready'

/**
 * @param rosterSize    pupils enrolled in the class being shown.
 * @param markedPupils  how many of them carry at least one mark in the period.
 *
 * The order matters: an empty class is reported as an empty CLASS, never as
 * missing marks. Telling a teacher with no pupils to go and enter marks sends
 * them to a grid with no rows in it.
 */
export function resultAvailability(rosterSize: number, markedPupils: number): ResultAvailability {
  if (rosterSize <= 0) return 'no-roster'
  if (markedPupils <= 0) return 'no-marks'
  return 'ready'
}

export interface ResultEmptyCopy {
  /** The heading — what is true, stated plainly. */
  title: string
  /** Why the screen is empty, in one line. */
  message: string
  /** The one thing that fixes it. `href` is unscoped; callers add the class. */
  action: { label: string; href: string }
}

/**
 * What to say for each empty state, and where to send the teacher.
 *
 * One action each, and it is the action that actually resolves the state —
 * not "go back". A screen that says "there is nothing here" and offers no way
 * to change that is a dead end with better manners.
 */
export const RESULT_EMPTY_COPY: Record<Exclude<ResultAvailability, 'ready'>, ResultEmptyCopy> = {
  'no-roster': {
    title: 'ថ្នាក់នេះមិនទាន់មានសិស្សទេ',
    message: 'បញ្ចូលសិស្សជាមុនសិន រួចលទ្ធផលនឹងបង្ហាញនៅទីនេះ។',
    action: { label: 'បញ្ចូលសិស្ស', href: '/enrollment' },
  },
  'no-marks': {
    title: 'មិនទាន់មានពិន្ទុសម្រាប់វគ្គនេះទេ',
    message: 'បញ្ចូលពិន្ទុជាមុនសិន រួចអាចមើល និងបោះពុម្ពលទ្ធផលបាន។',
    action: { label: 'បញ្ចូលពិន្ទុ', href: '/score/enter' },
  },
}
