import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ScoreEnterClient from './ScoreEnterClient'
import { logger } from '@/lib/utils/logger'

export default async function ScoreEnterPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch students
  let { data: students, error } = await supabase
    .from('students')
    .select('*')
    .eq('teacher_id', user.id)
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) {
    logger.error(error)
    students = []
  }

  return (
    <ScoreEnterClient initialStudents={students || []} userId={user.id} />
  )
}
