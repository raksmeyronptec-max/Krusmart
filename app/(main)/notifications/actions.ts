'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, Notification, NotificationInput } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { auditLog } from '@/lib/audit/log'

export async function getNotifications(): Promise<Notification[]> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        logger.error(error)
        return []
    }

    return data || []
}

export async function addNotification(payload: NotificationInput): Promise<ActionResult> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data, error } = await supabase
        .from('notifications')
        .insert({
            ...payload,
            teacher_id: user.id
        })
        .select('id')
        .single()

    if (error) {
        logger.error(error)
        return { error: error.message }
    }

    // `message` is deliberately not recorded: the audit trail is for tracing who
    // did what, not for retaining the content of messages sent to parents.
    await auditLog({
        action: 'notification.created', entityType: 'notification', entityId: data?.id ?? null,
        actorId: user.id, newValue: { target: payload.target, title: payload.title, type: payload.type },
    })

    revalidatePath('/notifications')
    return { success: true }
}

export async function deleteNotification(id: string): Promise<ActionResult> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id)
        .eq('teacher_id', user.id)

    if (error) {
        logger.error(error)
        return { error: error.message }
    }

    await auditLog({
        action: 'notification.deleted', entityType: 'notification', entityId: id, actorId: user.id,
    })

    revalidatePath('/notifications')
    return { success: true }
}
