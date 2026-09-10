import { redirect } from 'next/navigation'

import { CLASS_PARAM } from '@/lib/utils/scopeParam'

/**
 * `/score-analysis/subject` → `/score-analyse`.
 *
 * ── Why this route stopped being a page ───────────────────────────────────
 *
 * There were two analysis routes, one character apart — `score-analyse` and
 * `score-analysis` — sitting as sibling entries in the same menu. Two
 * destinations that near each other are not a choice, they are a trap: nothing
 * on either screen told a teacher which one they had opened, and the pair read
 * as a typo rather than as an information architecture.
 *
 * They also answer the same question. "How is this class doing" read across the
 * pupil, and read across the subject, are two views of one analysis — so they
 * are two views now, on `/score-analyse`, and this route forwards to it.
 * `SubjectAnalysisView` is the identical component, moved and renamed; not one
 * chart, query or figure changed.
 *
 * ── Why a redirect and not a deletion ─────────────────────────────────────
 *
 * The route keeps working, which is the project's standing rule: no bookmark
 * 404s and no internal link breaks. It stays declared `hidden: true` in
 * `lib/navigation.ts` so `moduleForPath` resolves it and the breadcrumb names a
 * module rather than blanking mid-redirect — the same pattern
 * `/score/template` and `/classroom/classes` use.
 *
 * `?class=` is preserved for the reason those two preserve it: it is how a
 * server component learns which class the teacher is looking at, and dropping
 * it would silently bounce them to their default class.
 */
export default async function SubjectAnalysisRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const requested = params[CLASS_PARAM]
  const classId = Array.isArray(requested) ? requested[0] : requested

  redirect(
    classId
      ? `/score-analyse?${CLASS_PARAM}=${encodeURIComponent(classId)}`
      : '/score-analyse',
  )
}
