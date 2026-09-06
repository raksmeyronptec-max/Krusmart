/**
 * Which class a request is about when the URL does not say.
 *
 * Pure and free of `server-only`, deliberately: `lib/utils/serverScope.ts`
 * carries the import, so a check that runs outside Next.js could not reach this
 * rule if it lived there. Same reason `scopeParam.ts` exists on its own.
 *
 * ── Why this file exists at all ────────────────────────────────────────────
 *
 * `resolveServerScope` used to pick the default with
 * `assignments.find((a) => a.is_homeroom) ?? assignments[0]` over a query
 * carrying **no `ORDER BY`**. That was deterministic only by accident: the
 * onboarding wizard runs once, so a teacher had exactly one homeroom row and
 * `find` had exactly one candidate.
 *
 * `/classroom` makes a second class routine, and migration 00003's
 * homeroom index is keyed on *(teacher, class, year)* — so two homeroom rows in
 * one year are legal, and `createClassAndAssign` writes `is_homeroom: true`
 * unconditionally. Without an explicit order the default class then depends on
 * Postgres row order: a teacher could open `/score/enter`, see class A, refresh,
 * and see class B — in the function that decides which marks are read and
 * written.
 *
 * ── The policy ─────────────────────────────────────────────────────────────
 *
 * **The oldest active homeroom class wins.** Oldest rather than newest because a
 * default must not move under a teacher who was not asking for it: creating a
 * class in September should not silently re-point every unparameterised screen
 * at it. `?class=` still overrides, which is how a teacher chooses at all.
 *
 * The order is applied twice on purpose — once as `ORDER BY` in the query, once
 * here. The SQL half is what keeps the answer stable; this half is what keeps it
 * stable if a caller ever assembles candidates from somewhere else, and it is
 * the half a test can reach.
 */

/** The fields the default-class rule reads. Any assignment row satisfies it. */
export interface DefaultClassCandidate {
  id: string
  class_id: string
  academic_year_id: string
  is_homeroom: boolean
  created_at?: string
}

/**
 * A **total** order over assignments: homeroom first, then oldest first.
 *
 * `id` breaks the final tie rather than leaving one. Two rows written in the
 * same transaction share a `created_at` to the microsecond, and a comparator
 * that returns 0 there hands the decision back to input order — which is the
 * nondeterminism this module exists to remove.
 *
 * A missing `created_at` sorts last: it means the caller did not select the
 * column, and guessing "very old" would promote an unknown row to the default.
 */
export function orderAssignments<T extends DefaultClassCandidate>(assignments: T[]): T[] {
  return [...assignments].sort((a, b) => {
    if (a.is_homeroom !== b.is_homeroom) return a.is_homeroom ? -1 : 1
    const at = a.created_at ?? ''
    const bt = b.created_at ?? ''
    if (at !== bt) {
      if (!at) return 1
      if (!bt) return -1
      return at < bt ? -1 : 1
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * The assignment a request resolves to.
 *
 * `requestedClassId` is honoured **only** when the caller actually holds that
 * class — the list passed in is already the caller's own active assignments, so
 * a forged `?class=` finds no match and falls through to their default rather
 * than widening anything.
 *
 * A class held both as homeroom and as a subject resolves to the homeroom row,
 * for the same reason it leads the ordering: it is the broader of the two.
 */
export function chooseAssignment<T extends DefaultClassCandidate>(
  assignments: T[],
  requestedClassId?: string,
): T | undefined {
  const ordered = orderAssignments(assignments)
  if (requestedClassId) {
    const requested = ordered.find((a) => a.class_id === requestedClassId)
    if (requested) return requested
  }
  return ordered[0]
}
