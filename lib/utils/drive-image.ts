/**
 * Make a Google Drive share link renderable as an `<img>`.
 *
 * Teachers paste Drive links for student photos, and a `drive.google.com/file/d/…`
 * URL serves an HTML viewer page, not an image — the tag renders broken. The
 * `lh3.googleusercontent.com/d/<id>` host serves the bytes.
 *
 * Anything that is not a Drive link is returned untouched, and a malformed URL
 * is returned as-is rather than thrown away: a bad link showing as a broken
 * image is easier for a teacher to diagnose than a silently blank avatar.
 *
 * Lifted out of `StudentTableClient` in Phase 5, where it was a private helper,
 * so the roster and the student detail view cannot disagree about it.
 */
export function getDriveImageUrl(url: string | null | undefined): string {
  if (!url) return ''

  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('drive.google.com')) {
      let fileId: string | null = null
      if (parsed.pathname.includes('/file/d/')) {
        fileId = parsed.pathname.split('/file/d/')[1].split('/')[0]
      } else if (parsed.searchParams.has('id')) {
        fileId = parsed.searchParams.get('id')
      }
      if (fileId) return `https://lh3.googleusercontent.com/d/${fileId}`
    }
  } catch {
    return url
  }

  return url
}
