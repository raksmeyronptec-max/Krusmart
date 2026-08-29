import { redirect } from 'next/navigation'
import { CLASS_PARAM } from '@/lib/utils/scopeParam'

/**
 * `/score/template` — the score template's configuration screen.
 *
 * This directory held only server actions until now; the screen those actions
 * back has always lived at `/score/subjects` ("មុខវិជ្ជាតាមថ្នាក់"). Rather than
 * grow a second configuration surface — two pages editing one template is how
 * they end up disagreeing — this route redirects there and the actions stay
 * where their callers already import them from.
 *
 * The class selection is preserved across the redirect: `?class=` is how a
 * server component learns which class the teacher is looking at, and dropping
 * it here would silently bounce them to their default class.
 */
export default async function ScoreTemplatePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const requested = params[CLASS_PARAM]
  const classId = Array.isArray(requested) ? requested[0] : requested

  redirect(classId ? `/score/subjects?${CLASS_PARAM}=${encodeURIComponent(classId)}` : '/score/subjects')
}
