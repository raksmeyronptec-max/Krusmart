import { redirect } from 'next/navigation'
import { CLASS_PARAM } from '@/lib/utils/scopeParam'

/**
 * `/classroom/classes` — the class-management screen, which is now `/classroom`.
 *
 * `/classroom` used to be a menu of four link cards whose first item was this
 * page. A teacher looking for "where do I create a class" found a menu instead
 * of an answer, so the list moved up and the menu's other three cards became
 * per-class links on each card. This route redirects rather than 404s: it is
 * bookmarkable, it is linked from `lib/onboarding/state.ts`'s neighbourhood and
 * from comments across the codebase, and a dead link to a page that still exists
 * under a shorter name is a gratuitous break.
 *
 * `?class=` is preserved across the redirect for the same reason
 * `/score/template` preserves it: it is how a server component learns which
 * class the teacher is looking at, and dropping it would silently bounce them
 * to their default class.
 */
export default async function ClassroomClassesRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const requested = params[CLASS_PARAM]
  const classId = Array.isArray(requested) ? requested[0] : requested

  redirect(classId ? `/classroom?${CLASS_PARAM}=${encodeURIComponent(classId)}` : '/classroom')
}
