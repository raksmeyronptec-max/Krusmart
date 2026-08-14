import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SubjectAnalysisClient from './SubjectAnalysisClient'

export default async function SubjectAnalysisPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // No props: the client pulls everything it renders through the
  // `getAllScoresByPeriod` server action, which re-checks the session itself.
  return <SubjectAnalysisClient />
}
