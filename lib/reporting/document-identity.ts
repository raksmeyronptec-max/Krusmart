/**
 * Which class a printed DOCUMENT says it is about.
 *
 * ── The defect this closes (Phase 14 F14-1) ───────────────────────────────
 *
 * Nineteen screens printed `settings.class_name` in their letterhead.
 * `settings` is the legacy per-TEACHER row — one value for the whole account —
 * so a teacher holding three classes printed every sheet under whichever class
 * name happened to be stored there. Observed: `/ranking` with ៤ខ តេស្ត selected
 * produced a sheet headed **ថ្នាក់ទី៣**, carrying ៤ខ តេស្ត's marks, above a
 * signature line for the នាយកសាលា.
 *
 * The marks were right. The class the document claimed to be about was not, and
 * a wrong class name on a signed sheet is worse than a missing one: it is
 * indistinguishable from a true one by the person receiving it.
 *
 * ── Why this is a shared function and not a fix per screen ────────────────
 *
 * The reporting ENGINE already had the rule (`resolveMonthlyClass` and friends
 * in `report-data.ts`): take the class row's own `name`, fall back to settings.
 * So the product already contained the right answer and the wrong answer at the
 * same time, and printed whichever one the teacher happened to reach — the
 * engine's .xlsx naming one class and the screen's own print naming another.
 *
 * One rule, read by both. The server composes it from the `classes` row it
 * already fetches; the client composes it from `useActiveClass()`, which is the
 * same selection `?class=` carries to that server. Neither invents a second
 * notion of "the class this paper is about".
 *
 * Pure and isomorphic — `server-only` code and client components both import
 * it, and `scripts/verify-documents.mts` runs it. Keep it free of `next/*`.
 */

/**
 * The class name a document should print.
 *
 * @param activeClassName the resolved class's own `classes.name` — the class the
 *   data on the page actually belongs to. `null`/empty for a pre-V2 account,
 *   which has no class row at all.
 * @param settingsClassName `settings.class_name`, the per-teacher legacy value.
 *   It is the FALLBACK and never the preference: it is the only class name a
 *   roster-scoped account has, and the wrong one for everybody else.
 *
 * Returns `''` when neither resolves, rather than a placeholder — a sheet's
 * own "ថ្នាក់៖ ..........." blank is a printed form's business, not this
 * function's, and screens differ about what that blank looks like.
 */
export function documentClassName(
  activeClassName: string | null | undefined,
  settingsClassName: string | null | undefined,
): string {
  const active = activeClassName?.trim()
  if (active) return active
  return settingsClassName?.trim() ?? ''
}
