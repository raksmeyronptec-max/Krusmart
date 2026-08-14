import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CertificateClient from './CertificateClient'

export default async function CertificatePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch settings for school info
  let { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('teacher_id', user.id)
    .single()

  // Fetch students
  let { data: students, error } = await supabase
    .from('students')
    .select('*')
    .eq('teacher_id', user.id)
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) {
    console.error(error)
    students = []
  }

  return (
    <CertificateClient initialStudents={students || []} settings={settings || {}} />
  )
}
