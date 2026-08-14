'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, HomeworkAssignment, HomeworkAssignmentInput } from '@/lib/types'

export async function getAssignments(): Promise<HomeworkAssignment[]> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('homework_assignments')
        .select('*')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error(error)
        return []
    }

    return data || []
}

export async function addAssignment(payload: HomeworkAssignmentInput): Promise<ActionResult> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('homework_assignments')
        .insert({
            ...payload,
            teacher_id: user.id
        })

    if (error) {
        console.error(error)
        return { error: error.message }
    }

    revalidatePath('/homework/send')
    return { success: true }
}

export async function deleteAssignment(id: string): Promise<ActionResult> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('homework_assignments')
        .delete()
        .eq('id', id)
        .eq('teacher_id', user.id)

    if (error) {
        console.error(error)
        return { error: error.message }
    }

    revalidatePath('/homework/send')
    return { success: true }
}
