import { UserRound } from 'lucide-react'
import { getDriveImageUrl } from '@/lib/utils/drive-image'

/**
 * The pupil's photo, or a placeholder.
 *
 * Not a client component and not `next/image`: the source is a teacher-pasted
 * Google Drive link, which the image optimiser cannot fetch without the remote
 * host being allow-listed, and which would break the moment a teacher pastes a
 * link from somewhere else. A plain `<img>` degrades to the browser's broken-
 * image handling, which is the honest outcome for a bad link.
 */
export function StudentPhoto({ url, name }: { url: string | null; name: string }) {
  const src = getDriveImageUrl(url)

  if (!src) {
    return (
      <div
        className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-divider bg-paper text-text-muted"
        aria-hidden="true"
      >
        <UserRound className="h-9 w-9" />
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- user-pasted remote image; next/image needs an allow-listed host and adds nothing for a 80px avatar
    <img
      src={src}
      alt={`រូបថតរបស់ ${name}`}
      referrerPolicy="no-referrer"
      className="h-20 w-20 shrink-0 rounded-xl border border-divider object-cover"
    />
  )
}

export default StudentPhoto
