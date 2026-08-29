'use server'

/**
 * The one upload endpoint every client-side image picker calls.
 *
 * Uploading is a server action rather than a browser-side S3 call on purpose:
 * an R2 access key handed to the browser is an open write handle on the
 * bucket for anyone who opens devtools — exactly the mistake the imgbb key
 * made before it was moved server-side.
 *
 * Three guards, all of which a client-side upload could not enforce:
 *  - the caller must be signed in, so the bucket is not an open relay;
 *  - the payload must be a real image of an accepted type;
 *  - it must be within the size ceiling before a byte reaches R2.
 *
 * The key is scoped by `user.id`, so an upload is always attributable to the
 * account that made it, and one teacher's objects never share a prefix with
 * another's.
 */

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  base64ByteLength,
  extensionForMime,
  parseImageDataUrl,
  uploadBufferToR2,
} from './r2'
import { randomUUID } from 'node:crypto'

/** Where an image may be filed. A closed set — the browser cannot invent a prefix. */
export type UploadFolder = 'students' | 'profiles' | 'homework' | 'attachments'

const UPLOAD_FOLDERS: readonly UploadFolder[] = ['students', 'profiles', 'homework', 'attachments']

/** Not exported: a `'use server'` module may only export async functions. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export interface UploadImageResult {
  success?: true
  url?: string
  error?: string
}

export async function uploadImageToR2Action({
  dataUrl,
  folder,
}: {
  dataUrl: string
  folder: UploadFolder
}): Promise<UploadImageResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  if (!UPLOAD_FOLDERS.includes(folder)) return { error: 'ទីតាំងរក្សាទុករូបភាពមិនត្រឹមត្រូវ' }

  const parsed = parseImageDataUrl(dataUrl)
  if (!parsed) return { error: 'ឯកសារនេះមិនមែនជារូបភាពទេ' }
  if (!ACCEPTED_IMAGE_MIME_TYPES.includes(parsed.mime)) {
    return { error: 'ប្រភេទរូបភាពនេះមិនត្រូវបានអនុញ្ញាតទេ (JPEG, PNG, WebP, GIF, SVG)' }
  }
  if (base64ByteLength(parsed.base64) > MAX_UPLOAD_BYTES) {
    return { error: 'ទំហំរូបភាពធំពេក (លើសពី ១០MB)' }
  }

  try {
    const key = `${folder}/${user.id}/${Date.now()}-${randomUUID()}.${extensionForMime(parsed.mime)}`
    const { url } = await uploadBufferToR2({
      buffer: Buffer.from(parsed.base64, 'base64'),
      key,
      contentType: parsed.mime,
    })
    return { success: true, url }
  } catch (error) {
    logger.error('R2 upload failed', error)
    return { error: 'មានបញ្ហាក្នុងការផ្ទុករូបភាព' }
  }
}
