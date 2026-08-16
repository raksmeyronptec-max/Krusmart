'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, HomeworkAssignment, HomeworkAssignmentInput } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { auditLog } from '@/lib/audit/log'

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
        logger.error(error)
        return []
    }

    return data || []
}

/**
 * Upload a homework photo to imgbb, from the server.
 *
 * The client used to hold the API key in a `formData.append('key', '…')` call,
 * which shipped it in the browser bundle — readable by anyone who opens
 * devtools, and usable against the account by anyone who copies it. The key now
 * lives in `IMGBB_API_KEY` and never leaves the server; the browser sends the
 * image bytes to this action instead.
 *
 * Two guards the client-side version had no way to enforce:
 *  - the caller must be signed in, so the upload endpoint is not an open relay;
 *  - the payload must actually be an image, and within the size ceiling, before
 *    a byte is forwarded to a third party.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export async function uploadHomeworkPhoto(
    dataUrl: string,
    name: string,
): Promise<{ url?: string; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const apiKey = process.env.IMGBB_API_KEY
    if (!apiKey) {
        logger.error('IMGBB_API_KEY is not set; homework photo upload is disabled')
        return { error: 'មិនអាចផ្ទុករូបភាពបានទេ សូមទាក់ទងអ្នកគ្រប់គ្រងប្រព័ន្ធ' }
    }

    const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(dataUrl)
    if (!match) return { error: 'ឯកសារនេះមិនមែនជារូបភាពទេ' }

    const base64 = match[1]
    // base64 encodes 3 bytes per 4 characters; close enough to reject an
    // oversized payload without decoding it first.
    if ((base64.length * 3) / 4 > MAX_UPLOAD_BYTES) {
        return { error: 'ទំហំរូបភាពធំពេក (លើសពី ១០MB)' }
    }

    const body = new FormData()
    body.append('key', apiKey)
    body.append('image', base64)
    body.append('name', name)

    try {
        const res = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body })
        const result = await res.json()
        if (!result?.success || !result?.data?.url) {
            logger.error('imgbb upload failed', result)
            return { error: 'មានបញ្ហាក្នុងការផ្ទុករូបភាព' }
        }
        return { url: result.data.url as string }
    } catch (error) {
        logger.error(error)
        return { error: 'មានបញ្ហាក្នុងការផ្ទុករូបភាព' }
    }
}

export async function addAssignment(payload: HomeworkAssignmentInput): Promise<ActionResult> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data, error } = await supabase
        .from('homework_assignments')
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

    await auditLog({
        action: 'homework.created', entityType: 'homework_assignment', entityId: data?.id ?? null,
        actorId: user.id, newValue: { subject: payload.subject, title: payload.title, due_date: payload.due_date },
    })

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
        logger.error(error)
        return { error: error.message }
    }

    await auditLog({
        action: 'homework.deleted', entityType: 'homework_assignment', entityId: id, actorId: user.id,
    })

    revalidatePath('/homework/send')
    return { success: true }
}
