import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/rbac/server'
import { getErrorMessage } from '@/lib/utils/errors'
import { fetchScoreTemplate, resolveServerScope } from '@/lib/utils/serverScope'
import { filterRowsForContext, type TemplateContext } from '@/lib/scores/template'
import type { ScoreTemplateSubjectRow } from '@/lib/types'

/**
 * The class a score-template write is about, resolved from the caller's own
 * assignments.
 *
 * Deliberately NOT in `actions.ts`: that file is `'use server'`, where every
 * export becomes a callable RPC endpoint. This is a helper, not an action, so
 * it lives in a plain `server-only` module and both `actions.ts` and
 * `selectionActions.ts` import the one copy — the alternative was the same
 * thirty lines of permission and scope resolution written twice, which is how
 * two surfaces end up disagreeing about who may write what.
 *
 * `classId` is a *request*, never an authority: `resolveServerScope` validates
 * it against the teacher's active assignments, so a forged `?class=` cannot
 * widen access, and the RLS policies in 00016/00028 check the same thing again
 * independently.
 */
export interface ClassContext {
  userId: string
  classId: string
  /**
   * Template rows already narrowed to this class's curriculum (level / grade /
   * track, 00021). Without the narrowing a grade-12 class would see two system
   * rows per subject key — one per track — and could inherit the wrong
   * stream's full mark.
   */
  rows: ScoreTemplateSubjectRow[]
  context: TemplateContext | null
}

/**
 * Resolve the class being edited, or a Khmer error to show the teacher.
 *
 * A legacy account with no assignment has no class layer to write to — RLS
 * would reject the insert anyway, so the refusal is explained here rather than
 * surfacing as an opaque failure.
 */
export async function classContext(
  classId?: string,
): Promise<ClassContext | { error: string }> {
  try {
    await requirePermission('scores:update')
  } catch (e) {
    return { error: getErrorMessage(e) }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'សូមចូលគណនីជាមុនសិន' }

  const scope = await resolveServerScope(user.id, classId)
  if (scope.mode !== 'v2') {
    return { error: 'គណនីនេះមិនទាន់មានថ្នាក់រៀនទេ ដូច្នេះមិនអាចកែបញ្ជីមុខវិជ្ជាតាមថ្នាក់បានឡើយ។' }
  }

  const { rows, context } = await fetchScoreTemplate(scope)
  return {
    userId: user.id,
    classId: scope.classId,
    rows: filterRowsForContext(rows, context),
    context,
  }
}
