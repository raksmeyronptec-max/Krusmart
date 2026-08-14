'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getNotifications() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error(error)
        return []
    }

    return data || []
}

export async function addNotification(payload: any) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('notifications')
        .insert({
            ...payload,
            teacher_id: user.id
        })

    if (error) {
        console.error(error)
        return { error: error.message }
    }

    revalidatePath('/notifications')
    return { success: true }
}

export async function deleteNotification(id: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id)
        .eq('teacher_id', user.id)

    if (error) {
        console.error(error)
        return { error: error.message }
    }

    revalidatePath('/notifications')
    return { success: true }
}
