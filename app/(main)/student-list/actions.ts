'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteStudent(id: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', id)
    .eq('teacher_id', user.id)

  if (error) {
    console.error(error)
    return { error: error.message }
  }

  revalidatePath('/student-list')
  return { success: true }
}

export async function deleteAllStudents() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { error } = await supabase
    .from('students')
    .delete()
    .eq('teacher_id', user.id)

  if (error) {
    console.error(error)
    return { error: error.message }
  }

  revalidatePath('/student-list')
  return { success: true }
}

export async function saveStudentsOrder(orderedIds: string[]) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Unauthorized' }
  }

  const promises = orderedIds.map((id, index) => 
    supabase.from('students').update({ order_index: index + 1 }).eq('id', id).eq('teacher_id', user.id)
  )

  const results = await Promise.all(promises)
  const hasError = results.some(r => r.error)

  if (hasError) {
    console.error('Error saving order:', results.find(r => r.error)?.error)
    return { error: 'បរាជ័យក្នុងការរក្សាទុកលំដាប់ សូមប្រាកដថាអ្នកបានបង្កើត column "order_index" (int8) នៅក្នុង Table students នៃ Supabase!' }
  }

  revalidatePath('/student-list')
  return { success: true }
}
