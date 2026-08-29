'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, HomeworkAssignment, HomeworkAssignmentInput } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { auditLog } from '@/lib/audit/log'
import {
    ACCEPTED_IMAGE_MIME_TYPES, base64ByteLength, parseImageDataUrl, uploadBase64ToR2,
} from '@/lib/storage/r2'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

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
 * Upload a homework photo to Cloudflare R2, from the server.
 *
 * The client used to hold an imgbb API key in a `formData.append('key', '…')`
 * call, which shipped it in the browser bundle — readable by anyone who opens
 * devtools, and usable against the account by anyone who copies it. The photo
 * now lands in the app's own R2 bucket, and the credentials never leave the
 * server: the browser sends the image bytes to this action instead.
 *
 * Two guards the client-side version had no way to enforce:
 *  - the caller must be signed in, so the upload endpoint is not an open relay;
 *  - the payload must actually be an image, and within the size ceiling, before
 *    a byte is written to the bucket.
 */
export async function uploadHomeworkPhoto(
    dataUrl: string,
    name: string,
): Promise<{ url?: string; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const parsed = parseImageDataUrl(dataUrl)
    if (!parsed) return { error: 'ឯកសារនេះមិនមែនជារូបភាពទេ' }
    if (!ACCEPTED_IMAGE_MIME_TYPES.includes(parsed.mime)) {
        return { error: 'ប្រភេទរូបភាពនេះមិនត្រូវបានអនុញ្ញាតទេ (JPEG, PNG, WebP, GIF, SVG)' }
    }
    if (base64ByteLength(parsed.base64) > MAX_UPLOAD_BYTES) {
        return { error: 'ទំហំរូបភាពធំពេក (លើសពី ១០MB)' }
    }

    try {
        // Scoped by uploader, like every other upload — see lib/storage/actions.ts.
        const { url } = await uploadBase64ToR2({
            dataUrl,
            folder: `homework/${user.id}`,
            filename: name,
        })
        return { url }
    } catch (error) {
        logger.error('homework photo upload failed', error)
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
