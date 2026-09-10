'use client'

import { useId, useRef, useState } from 'react'
import { Camera, Info, Trash2 } from 'lucide-react'
import { notify } from '@/components/ui/feedback/notify'
import { uploadImageToR2Action } from '@/lib/storage/actions'
import { MAX_IMAGE_DATA_URL_BYTES } from '@/lib/profile/schema'

export interface ImageUploadFieldProps {
  label: string
  /** Image URL — an R2 CDN link, a legacy stored data URL, or ''. */
  value: string
  onChange: (url: string) => void
  /** 'circle' for the avatar, 'square' for logos/seals/signatures. */
  shape?: 'circle' | 'square'
  /** Longest output edge after the client-side resize. */
  maxEdge?: number
  /** PNG keeps transparency (logo/seal/signature); JPEG for photos. */
  mime?: 'image/png' | 'image/jpeg'
  /** Persistent guidance shown under the control — not a placeholder. */
  helper?: string
  /** Shown inside the empty frame, e.g. an initials letter or an icon. */
  fallback?: React.ReactNode
  uploadLabel?: string
  disabled?: boolean
  /** Validation error from the shared schema, rendered inline. */
  error?: string
}

const MAX_INPUT_BYTES = 5 * 1024 * 1024

/**
 * The one uploader behind all four profile images (avatar, school logo,
 * director seal, teacher signature). Resizes on a canvas before anything
 * leaves the browser — a 40MB phone photo never travels as a data URL — then
 * hands the compressed bytes to the R2 upload action and stores the CDN URL
 * it returns. `settings` holds a link, not an image.
 *
 * The data-URL size cap is still checked before the upload: it is cheaper to
 * refuse an over-large image here than to push it to the bucket and have the
 * server schema reject the save afterwards.
 */
export default function ImageUploadField({
  label,
  value,
  onChange,
  shape = 'square',
  maxEdge = 500,
  mime = 'image/png',
  helper,
  fallback,
  uploadLabel = 'ជ្រើសរើសរូបភាព',
  disabled = false,
  error,
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const helperId = useId()

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      notify.error('ឯកសារនេះមិនមែនជារូបភាពទេ')
      return
    }
    if (file.size > MAX_INPUT_BYTES) {
      notify.error('ទំហំរូបភាពធំពេក (លើសពី 5MB)។ សូមជ្រើសរើសរូបភាពតូចជាងនេះ')
      return
    }

    setBusy(true)
    const reader = new FileReader()
    reader.onerror = () => {
      setBusy(false)
      notify.error('មិនអាចអានរូបភាពនេះបានទេ')
    }
    reader.onload = (event) => {
      const img = new Image()
      img.onerror = () => {
        setBusy(false)
        notify.error('មិនអាចអានរូបភាពនេះបានទេ')
      }
      img.onload = () => {
        let { width, height } = img
        const scale = Math.min(1, maxEdge / Math.max(width, height))
        width = Math.round(width * scale)
        height = Math.round(height * scale)

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL(mime, 0.8)

        if (dataUrl.length > MAX_IMAGE_DATA_URL_BYTES) {
          setBusy(false)
          notify.error('រូបភាពនៅតែធំពេកបន្ទាប់ពីបង្រួម — សូមជ្រើសរើសរូបសាមញ្ញជាងនេះ')
          return
        }

        // `busy` stays true across the upload, so the spinner covers the round
        // trip rather than only the canvas work the user never waits for.
        void uploadImageToR2Action({ dataUrl, folder: 'profiles' })
          .then((result) => {
            if (result.error || !result.url) {
              notify.error(result.error ?? 'មានបញ្ហាក្នុងការផ្ទុករូបភាព')
              return
            }
            onChange(result.url)
          })
          .catch(() => notify.error('មានបញ្ហាក្នុងការផ្ទុករូបភាព'))
          .finally(() => setBusy(false))
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const frameClass =
    shape === 'circle'
      ? 'h-20 w-20 rounded-full'
      : 'h-20 w-20 rounded-lg'

  return (
    <div>
      <p lang="km" className="mb-1 text-[13px] font-bold leading-[1.7] text-text-body">{label}</p>
      <div className="flex items-center gap-4">
        <div
          className={`${frameClass} flex shrink-0 items-center justify-center overflow-hidden border-2 border-dashed border-divider bg-paper`}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- R2 CDN URL or legacy data URL; next/image needs an allow-listed host and adds nothing at 80px
            <img src={value} alt={label} className="h-full w-full object-contain" />
          ) : (
            fallback ?? <Camera aria-hidden className="h-6 w-6 text-text-muted" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={disabled || busy}
              aria-busy={busy}
              aria-describedby={helper ? helperId : undefined}
              onClick={() => inputRef.current?.click()}
              className="tap-target inline-flex cursor-pointer items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3.5 py-2 text-[13px] font-bold text-brand shadow-sm transition hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <span
                  aria-hidden
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
                />
              ) : (
                <Camera aria-hidden className="h-4 w-4" />
              )}
              <span lang="km">{uploadLabel}</span>
            </button>
            {value && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange('')}
                className="tap-target inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-2 text-[13px] font-semibold text-danger transition hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5" /> លុប
              </button>
            )}
          </div>
          {error && (
            <p lang="km" role="alert" className="mt-1.5 text-[12px] font-semibold leading-[1.7] text-danger">
              {error}
            </p>
          )}
          {helper && (
            <p id={helperId} lang="km" className="mt-1.5 flex items-start gap-1 text-[11px] leading-[1.7] text-text-muted">
              <Info aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
              {helper}
            </p>
          )}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}
