'use server'

import { createClient } from '@/lib/supabase/server'
import { fetchScoreTemplateRows, resolveServerScope } from '@/lib/utils/serverScope'
import type { ScoreTemplateSubjectRow } from '@/lib/types'

/**
 * The score template rows visible to the signed-in teacher.
 *
 * A thin server action so the client hook can reach `serverScope.ts`, which is
 * `server-only` and cannot be imported from the browser — the same arrangement
 * `useCustomSubjects` uses with `custom-subjects/actions.ts`. There is no page
 * in this directory; it exists solely to hold the action.
 *
 * Returns the *rows*, not the resolved list. The client re-runs
 * `resolveTemplate()` whenever the teacher flips between monthly and semester,
 * and re-resolving a dozen cached rows is cheaper than another round trip.
 *
 * `classId` is validated against the caller's own assignments by
 * `resolveServerScope`, so a forged id cannot widen what comes back; RLS is the
 * boundary regardless.
 */
export async function listScoreTemplateSubjects(
  classId?: string,
): Promise<ScoreTemplateSubjectRow[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const scope = await resolveServerScope(user.id, classId)
  return fetchScoreTemplateRows(scope)
}
