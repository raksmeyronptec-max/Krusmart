/**
 * Shrink a picked image before it is carried around as a data URL.
 *
 * The enrollment form stores the student photo inline in `students.photo_url`.
 * A photo straight off a phone camera is 3–5 MB, and base64 inflates it by a
 * further third — so every roster read, every printed report and every export
 * afterwards drags ~6 MB per student across a connection that, in a Cambodian
 * classroom, is usually mobile data. Downscaling to a 640px JPEG lands around
 * 40–80 KB and is still sharper than any place the photo is displayed (the
 * largest is the 144px student card).
 *
 * Failure is not fatal: if the browser cannot decode the file, the original
 * data URL is returned. A large photo is better than no photo.
 */

export interface CompressOptions {
  /** Longest edge of the result, in CSS pixels. */
  maxEdge?: number
  /** JPEG quality, 0–1. */
  quality?: number
}

/** Formats that must not be rasterised — vector stays vector, animation stays animated. */
const PASS_THROUGH = ['image/svg+xml', 'image/gif']

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

/**
 * Decode with `createImageBitmap` where available — it runs off the main
 * thread and honours the EXIF orientation flag, so a portrait photo taken on a
 * phone is not delivered on its side. `HTMLImageElement` is the fallback.
 */
async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { source: bitmap, width: bitmap.width, height: bitmap.height }
  }

  const url = await readAsDataUrl(file)
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('decode failed'))
    img.src = url
  })
  return { source: img, width: img.naturalWidth, height: img.naturalHeight }
}

export async function compressImageFile(
  file: File,
  { maxEdge = 640, quality = 0.82 }: CompressOptions = {}
): Promise<string> {
  if (PASS_THROUGH.includes(file.type)) return readAsDataUrl(file)

  try {
    const { source, width, height } = await decode(file)
    const scale = Math.min(1, maxEdge / Math.max(width, height))

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))

    const ctx = canvas.getContext('2d')
    if (!ctx) return readAsDataUrl(file)

    // JPEG has no alpha channel; without this a transparent PNG comes out black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)

    if ('close' in source && typeof source.close === 'function') source.close()

    const out = canvas.toDataURL('image/jpeg', quality)
    // A tiny result means the encode produced nothing usable.
    return out.length > 'data:image/jpeg;base64,'.length + 32 ? out : readAsDataUrl(file)
  } catch {
    return readAsDataUrl(file)
  }
}

/** Rough byte size of a data URL, for showing the user what they are about to store. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return 0
  return Math.round((dataUrl.length - comma - 1) * 0.75)
}
