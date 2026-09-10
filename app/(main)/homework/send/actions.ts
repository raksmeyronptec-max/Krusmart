'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, HomeworkAssignment, HomeworkAssignmentInput } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { auditLog } from '@/lib/audit/log'
import { resolveServerScope } from '@/lib/utils/serverScope'
import {
    ACCEPTED_IMAGE_MIME_TYPES, base64ByteLength, parseImageDataUrl, uploadBase64ToR2,
} from '@/lib/storage/r2'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/**
 * The assignments to show for one class.
 *
 * ── Why this takes a class at all (00032) ─────────────────────────────────
 *
 * It used to read `.eq('teacher_id', user.id)` and nothing else, which made
 * this the one class-scoped workflow in the product that ignored the active
 * class: a teacher holding ៥ក and ៦ក saw both classes' homework in one list
 * with no way to tell them apart. `homework_assignments.class_id` exists now,
 * so the list can answer the question the rest of the app answers.
 *
 * `resolveServerScope` re-validates the requested id against the caller's own
 * assignments, exactly as every other class-scoped read does — a forged
 * `?class=` resolves to their own default rather than widening anything, and
 * RLS refuses it again at the database.
 *
 * ── The NULL half is load-bearing ─────────────────────────────────────────
 *
 * Rows written before 00032 carry no class. They are shown in EVERY class's
 * list rather than hidden from all of them: the teacher published them to
 * their whole audience, that is still what they mean, and a filter that made a
 * teacher's existing homework vanish the day this shipped would read as data
 * loss. A legacy account resolves `mode: 'legacy'` and sees the unfiltered list
 * it always saw.
 */
export async function getAssignments(classId?: string): Promise<HomeworkAssignment[]> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const scope = await resolveServerScope(user.id, classId)

    let query = supabase
        .from('homework_assignments')
        .select('*')
        .eq('teacher_id', user.id)

    if (scope.mode === 'v2') {
        query = query.or(`class_id.eq.${scope.classId},class_id.is.null`)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

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

/**
 * Publish one assignment to a class.
 *
 * The class comes from `resolveServerScope`, never from the payload: `class_id`
 * is an ADDRESS on this table — it decides which parents can read the row
 * (00032) — so letting the browser name it would be a write that widens a read.
 * The database refuses a class the caller does not actively teach in any case;
 * this is the usual second guard.
 *
 * A legacy account stamps NULL, which is exactly the reach it had before.
 */
export async function addAssignment(
    payload: HomeworkAssignmentInput,
    classId?: string,
): Promise<ActionResult> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const scope = await resolveServerScope(user.id, classId)

    const { data, error } = await supabase
        .from('homework_assignments')
        .insert({
            ...payload,
            teacher_id: user.id,
            class_id: scope.mode === 'v2' ? scope.classId : null,
        })
        .select('id')
        .single()

    if (error) {
        logger.error(error)
        return { error: error.message }
    }

    await auditLog({
        action: 'homework.created', entityType: 'homework_assignment', entityId: data?.id ?? null,
        actorId: user.id,
        newValue: {
            subject: payload.subject,
            title: payload.title,
            due_date: payload.due_date,
            class_id: scope.mode === 'v2' ? scope.classId : null,
        },
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
