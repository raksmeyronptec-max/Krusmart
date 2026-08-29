import 'server-only'

/**
 * Cloudflare R2 object storage — the app's single home for uploaded images.
 *
 * Two things used to store pictures, and neither of them stored a file:
 *  - `/homework/send` posted the bytes to imgbb, a third-party image host, on
 *    an API key that has no relationship to the teacher who uploaded it;
 *  - everything else (student photos, the four profile images) inlined a
 *    base64 data URL straight into a Postgres TEXT column, so every roster
 *    read, print and export dragged the picture bytes along with the row.
 *
 * R2 is S3-compatible, so this is the AWS SDK pointed at the account
 * endpoint. Credentials are server-only by design — nothing here may be
 * imported from a client component. Only `NEXT_PUBLIC_R2_PUBLIC_URL`, the
 * read-only CDN host, crosses into the browser, and only as a stored URL.
 */

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'

/** Extension per accepted MIME type. The map is also the allow-list. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

export const ACCEPTED_IMAGE_MIME_TYPES = Object.keys(EXTENSION_BY_MIME)

/** Extension for a MIME type, falling back to a harmless `bin`. */
export function extensionForMime(mime: string): string {
  return EXTENSION_BY_MIME[mime.toLowerCase()] ?? 'bin'
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set — R2 uploads are unavailable`)
  return value
}

/**
 * One client per server process. The SDK holds a connection pool, so building
 * a fresh client per upload would leak sockets under any real load; module
 * scope in Node gives us the singleton for free.
 *
 * Lazily constructed rather than at import time: a missing credential must
 * fail the one upload that needs it, not the whole route that imported this
 * module.
 */
let client: S3Client | null = null

export function getR2Client(): S3Client {
  if (client) return client
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    },
  })
  return client
}

/** Public CDN URL for an object key, with no double slash however the env var is written. */
export function publicUrlForKey(key: string): string {
  return `${required('NEXT_PUBLIC_R2_PUBLIC_URL').replace(/\/+$/, '')}/${key}`
}

export interface UploadResult {
  url: string
  key: string
}

/** Put raw bytes at an exact key. The caller owns the key; nothing is appended. */
export async function uploadBufferToR2({
  buffer,
  key,
  contentType,
}: {
  buffer: Buffer | Uint8Array
  key: string
  contentType: string
}): Promise<UploadResult> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: required('R2_BUCKET_NAME'),
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // Served straight from the CDN and never overwritten — the key is unique
      // per upload, so a year is safe and saves a round trip on every render.
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  return { url: publicUrlForKey(key), key }
}

/** Parsed halves of a `data:<mime>;base64,<payload>` URL. */
export interface ParsedDataUrl {
  mime: string
  base64: string
}

/**
 * Split a base64 data URL. Returns null rather than throwing, because every
 * caller is validating untrusted input and wants to answer with its own
 * Khmer error message.
 */
export function parseImageDataUrl(dataUrl: string): ParsedDataUrl | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim())
  if (!match) return null
  return { mime: match[1].toLowerCase(), base64: match[2].replace(/\s+/g, '') }
}

/**
 * Decoded byte length of a base64 payload, without decoding it.
 *
 * 4 characters carry 3 bytes; each trailing `=` is one byte of padding. Used
 * to reject an oversized upload before it is materialised in memory.
 */
export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

/**
 * Upload a base64 data URL under a generated, collision-resistant key.
 *
 * `Date.now()` sorts the bucket usefully by time; the UUID is what actually
 * makes the key unique, since two teachers can upload in the same millisecond.
 */
export async function uploadBase64ToR2({
  dataUrl,
  folder,
  filename,
}: {
  dataUrl: string
  folder: string
  filename?: string
}): Promise<UploadResult> {
  const parsed = parseImageDataUrl(dataUrl)
  if (!parsed) throw new Error('Not a base64 image data URL')

  const ext = extensionForMime(parsed.mime)
  const base = filename ? sanitiseFilename(filename) : ''
  const key = `${folder.replace(/^\/+|\/+$/g, '')}/${Date.now()}-${randomUUID()}${base ? `-${base}` : ''}.${ext}`

  return uploadBufferToR2({
    buffer: Buffer.from(parsed.base64, 'base64'),
    key,
    contentType: parsed.mime,
  })
}

/**
 * Reduce a caller-supplied name to something safe inside an object key.
 *
 * Khmer titles are the common case here, and percent-encoding a whole Khmer
 * sentence produces a key hundreds of characters long — so non-ASCII is
 * dropped rather than escaped. The uniqueness lives in the UUID, not here;
 * this is only a human-readable hint, and '' is a fine answer.
 */
function sanitiseFilename(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
