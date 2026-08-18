import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  classIdFromSearchParams,
  fetchScoreTemplate,
  resolveServerScope,
} from '@/lib/utils/serverScope'
import ScoreSubjectsClient from './ScoreSubjectsClient'

export const metadata = { title: 'មុខវិជ្ជាតាមថ្នាក់' }

/**
 * មុខវិជ្ជាតាមថ្នាក់ — the class layer of the score template.
 *
 * Rendered on the server so the list is correct on first paint: the subject
 * list is the thing a teacher came here to read, and a flash of the national
 * default before their own customisation loads would read as "my changes are
 * gone".
 *
 * The class is resolved from the caller's own assignments; `?class=` is only a
 * request, validated by `resolveServerScope` against what they actually hold.
 */
export default async function ScoreSubjectsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)
  const { rows, context } = await fetchScoreTemplate(scope)

  let className = ''
  if (scope.mode === 'v2') {
    const { data } = await supabase
      .from('classes')
      .select('name')
      .eq('id', scope.classId)
      .maybeSingle()
    className = data?.name ?? ''
  }

  return (
    <ScoreSubjectsClient
      initialRows={rows}
      templateContext={context}
      classId={scope.mode === 'v2' ? scope.classId : null}
      className={className}
    />
  )
}
