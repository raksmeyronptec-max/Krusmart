'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveClassTeachingRole, type ClassTeachingRole } from '@/lib/utils/serverScope'

/**
 * The caller's teaching role for a class, for client screens.
 *
 * Thin, like `listScoreTemplateSubjects` beside it: `serverScope.ts` is
 * `server-only`, so a client hook cannot reach `resolveClassTeachingRole`
 * directly. The role is read from the caller's own assignments and never from
 * anything the client supplies.
 */
export async function getClassTeachingRole(classId?: string): Promise<ClassTeachingRole> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { isHomeroom: false, subjectKeys: [], coversWholeClass: true }

  return resolveClassTeachingRole(user.id, classId ?? null)
}
