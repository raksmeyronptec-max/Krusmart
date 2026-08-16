'use client'

import { useState } from 'react'
import { ImagePlus, Loader2, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import { fieldLabel } from '@/components/ui/forms/fieldStyles'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { compressImageFile, dataUrlBytes } from '@/lib/utils/image'
import { logger } from '@/lib/utils/logger'

/**
 * The optional photo — a page of the textbook, a worksheet, the board.
 *
 * A real `<input type="file">` does the work. The visible control is its
 * `<label>`, so the keyboard, the screen reader and the mobile file picker all
 * behave natively; the drop zone is layered on top and is purely additive —
 * remove it and the field still works. That is the order the accessibility
 * guidance asks for: semantic element first, enhancement second.
 *
 * Constraints are stated *before* the picker opens, not after a 12MB photo has
 * been read into memory. The ceiling matches the one the server enforces in
 * `uploadHomeworkPhoto`; the client check only saves the round trip.
 */

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = 'image/*'

/**
 * Downscale target for a homework photo.
 *
 * Larger than the 640px the student avatars use: this is usually a page of a
 * textbook or a worksheet, and a parent has to be able to read the questions
 * after pinch-zooming. 1600px keeps the text legible and still lands a phone
 * photo in the low hundreds of KB rather than six megabytes of base64 — which
 * matters on the mobile connection most of these teachers are on.
 */
const MAX_EDGE = 1600
const QUALITY = 0.85

export interface HomeworkAttachmentFieldProps {
  /** Data URL of the selected image, or `null`. */
  value: string | null
  fileName: string | null
  onSelect: (dataUrl: string, file: File) => void
  onClear: () => void
  onError: (message: string) => void
  disabled?: boolean
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${toKhmerNumber(mb.toFixed(1))} MB`
  return `${toKhmerNumber(Math.max(1, Math.round(bytes / 1024)))} KB`
}

export function HomeworkAttachmentField({
  value,
  fileName,
  onSelect,
  onClear,
  onError,
  disabled = false,
}: HomeworkAttachmentFieldProps) {
  // Bumping this remounts the input, which is the only way to clear it and the
  // only way a second attempt at the *same* file fires `change` again.
  const [inputKey, setInputKey] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [size, setSize] = useState<number | null>(null)
  const [reading, setReading] = useState(false)

  const reset = () => {
    setInputKey((k) => k + 1)
    setSize(null)
  }

  const accept = async (file: File | undefined) => {
    if (!file) return

    if (!file.type.startsWith('image/')) {
      onError('ឯកសារនេះមិនមែនជារូបភាពទេ។ សូមជ្រើសរើស JPG ឬ PNG។')
      reset()
      return
    }
    if (file.size > MAX_BYTES) {
      onError(`ទំហំរូបថតធំពេក (${formatSize(file.size)})។ អតិបរមា ១០MB។`)
      reset()
      return
    }

    setReading(true)
    try {
      // Downscaled here rather than on the way out: the data URL is what the
      // server action forwards, so compressing first shrinks the upload, the
      // stored image and every parent's later download in one step.
      const dataUrl = await compressImageFile(file, { maxEdge: MAX_EDGE, quality: QUALITY })
      const bytes = dataUrlBytes(dataUrl)

      // A format `compressImageFile` passes through untouched (SVG, GIF) can
      // still be over the ceiling the server enforces.
      if (bytes > MAX_BYTES) {
        onError(`ទំហំរូបភាពធំពេក (${formatSize(bytes)})។ អតិបរមា ១០MB។`)
        reset()
        return
      }

      setSize(bytes)
      onSelect(dataUrl, file)
    } catch (error) {
      logger.error('Failed to read homework photo', error)
      onError('អានរូបភាពមិនបានសម្រេច។ សូមសាកល្បងម្តងទៀត។')
      reset()
    } finally {
      setReading(false)
    }
  }

  const clear = () => {
    onClear()
    reset()
  }

  return (
    <div>
      <span className={`${fieldLabel} block`} id="hw-attachment-label">
        រូបភាពភ្ជាប់ <span className="font-normal text-text-muted">(ជម្រើស)</span>
      </span>

      {value ? (
        <div className="rounded-lg border border-divider bg-paper p-2.5">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- locally-read data URL; next/image cannot process one and this never reaches print */}
            <img
              src={value}
              alt={fileName ? `មើលជាមុន៖ ${fileName}` : 'មើលជាមុនរូបភាពកិច្ចការផ្ទះ'}
              className="max-h-32 w-auto rounded-md border border-divider bg-bg-surface object-contain"
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-xs font-bold text-text-heading">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                {fileName ?? 'រូបភាពដែលបានជ្រើសរើស'}
              </p>
              {size !== null && (
                <p className="mt-0.5 text-[11px] text-text-muted">{formatSize(size)}</p>
              )}
              <Button
                variant="secondary"
                size="sm"
                type="button"
                printHidden={false}
                onClick={clear}
                className="mt-2"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" /> ដកចេញ
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor="hw-attachment"
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void accept(e.dataTransfer.files?.[0])
          }}
          className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition ${
            dragging
              ? 'border-brand bg-brand-100/60 dark:bg-brand-900/30'
              : 'border-divider bg-paper hover:border-brand-400'
          } ${disabled || reading ? 'pointer-events-none opacity-60' : ''}`}
        >
          {reading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden="true" />
              <span className="text-sm font-bold text-text-body">កំពុងរៀបចំរូបភាព...</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-text-muted" aria-hidden="true" />
              <span className="text-sm font-bold text-text-body">ជ្រើសរើសរូបភាព ឬអូសមកទម្លាក់ទីនេះ</span>
              <span className="text-[11px] text-text-muted">
                JPG · PNG · អតិបរមា ១០MB · រូបភាពនឹងត្រូវបង្រួមដោយស្វ័យប្រវត្តិ
              </span>
            </>
          )}
        </label>
      )}

      {/*
        Always rendered, never `display:none` — a hidden-but-present input keeps
        the label association and stays reachable by the keyboard through it.
      */}
      <input
        key={inputKey}
        id="hw-attachment"
        type="file"
        accept={ACCEPT}
        disabled={disabled || reading}
        onChange={(e) => void accept(e.target.files?.[0])}
        className="sr-only"
      />
    </div>
  )
}

export default HomeworkAttachmentField
