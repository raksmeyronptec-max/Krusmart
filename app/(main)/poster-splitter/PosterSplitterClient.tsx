'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, Download, Grid3x3, ImageUp, Loader2, Scissors } from 'lucide-react'
import Select from '@/components/ui/forms/Select'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { logger } from '@/lib/utils/logger'
import {
  PAPER_SIZES,
  planTiles,
  tileOrigin,
  type Orientation,
  type PaperSizeKey,
} from '@/lib/utils/poster-tiles'

/**
 * បំបែកសន្លឹក Poster — slice one large image across many printable sheets.
 *
 * Everything happens in the browser: the image is never uploaded, so a teacher
 * can split a poster on a slow connection and nothing lands in storage. `jspdf`
 * is imported dynamically because it is a large dependency that only this page
 * needs, and pulling it into the shared bundle would slow every other route.
 */
export default function PosterSplitterClient() {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')

  const [totalW, setTotalW] = useState(120) // cm
  const [totalH, setTotalH] = useState(80)
  const [paper, setPaper] = useState<PaperSizeKey>('A4')
  const [orientation, setOrientation] = useState<Orientation>('p')
  const [margin, setMargin] = useState(10) // mm
  const [overlap, setOverlap] = useState(10)
  const [includeGuide, setIncludeGuide] = useState(true)

  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const plan = useMemo(
    () => planTiles({ totalW: totalW * 10, totalH: totalH * 10, paper, orientation, margin, overlap }),
    [totalW, totalH, paper, orientation, margin, overlap],
  )

  const handleFile = useCallback((file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('សូមជ្រើសរើសឯកសាររូបភាព')
      return
    }

    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      setImage(img)
      setPreview(url)
      setFileName(file.name)
      // Offer the poster's own aspect ratio as the starting height, so the
      // default settings do not distort what the teacher uploaded.
      setTotalH(Math.round((totalW * img.naturalHeight) / img.naturalWidth))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      toast.error('មិនអាចបើករូបភាពនេះបានទេ')
    }
    img.src = url
  }, [totalW])

  const generate = async () => {
    if (!image || plan.error || plan.sheets === 0) return

    setBusy(true)
    setProgress(0)

    try {
      const { jsPDF } = await import('jspdf')
      const { sheetW, sheetH, usableW, usableH, rows, cols } = plan

      const doc = new jsPDF({ orientation, unit: 'mm', format: [sheetW, sheetH] })

      // Optional first page: a scaled map showing how the sheets tile together.
      if (includeGuide) {
        doc.setFillColor(240, 249, 255)
        doc.rect(0, 0, sheetW, sheetH, 'F')
        doc.setTextColor(0, 84, 166)
        doc.setFontSize(20)
        doc.text('Poster Layout Guide', sheetW / 2, 22, { align: 'center' })
        doc.setFontSize(10)
        doc.setTextColor(71, 85, 105)
        doc.text(`${totalW} x ${totalH} cm  |  ${rows * cols} sheets (${cols} x ${rows})`, sheetW / 2, 32, { align: 'center' })

        const mapScale = Math.min((sheetW - 30) / (totalW * 10), (sheetH - 60) / (totalH * 10))
        const mapX = (sheetW - totalW * 10 * mapScale) / 2
        const mapY = 42

        doc.setDrawColor(220, 38, 38)
        doc.setLineDashPattern([2, 2], 0)
        doc.rect(mapX, mapY, totalW * 10 * mapScale, totalH * 10 * mapScale, 'D')
        doc.setLineDashPattern([], 0)
        doc.setDrawColor(59, 130, 246)
        doc.setLineWidth(0.3)

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const { x, y } = tileOrigin(plan, r, c)
            doc.setFillColor(255, 255, 255)
            doc.rect(mapX + x * mapScale, mapY + y * mapScale, usableW * mapScale, usableH * mapScale, 'FD')
            doc.setFontSize(8)
            doc.setTextColor(0, 84, 166)
            doc.text(
              String(r * cols + c + 1),
              mapX + (x + usableW / 2) * mapScale,
              mapY + (y + usableH / 2) * mapScale + 1,
              { align: 'center' },
            )
          }
        }
      }

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('canvas unavailable')

      const scaleX = image.naturalWidth / (totalW * 10)
      const scaleY = image.naturalHeight / (totalH * 10)

      let done = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (includeGuide || r > 0 || c > 0) doc.addPage([sheetW, sheetH], orientation)

          const { x, y } = tileOrigin(plan, r, c)
          canvas.width = Math.max(1, Math.round(usableW * scaleX))
          canvas.height = Math.max(1, Math.round(usableH * scaleY))

          // White ground: the last row and column run past the image, and an
          // unpainted canvas would carry over the previous tile's pixels.
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(
            image,
            x * scaleX, y * scaleY, canvas.width, canvas.height,
            0, 0, canvas.width, canvas.height,
          )

          doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, usableW, usableH)

          // Trim marks at the printable corners, so the glue strip can be cut.
          doc.setDrawColor(220, 38, 38)
          doc.setLineWidth(0.3)
          const len = Math.min(5, margin - 1)
          if (len > 0) {
            doc.line(margin, margin, margin, margin - len)
            doc.line(margin, margin, margin - len, margin)
            doc.line(sheetW - margin, margin, sheetW - margin, margin - len)
            doc.line(sheetW - margin, margin, sheetW - margin + len, margin)
            doc.line(margin, sheetH - margin, margin, sheetH - margin + len)
            doc.line(margin, sheetH - margin, margin - len, sheetH - margin)
            doc.line(sheetW - margin, sheetH - margin, sheetW - margin, sheetH - margin + len)
            doc.line(sheetW - margin, sheetH - margin, sheetW - margin + len, sheetH - margin)
          }

          doc.setFontSize(7)
          doc.setTextColor(150, 150, 150)
          doc.text(`S:${r * cols + c + 1}  C:${c + 1} R:${r + 1}  ${totalW}x${totalH}cm`, margin, Math.max(3, margin - 2))

          done++
          setProgress(Math.round((done / plan.sheets) * 100))
          // Yield so the progress bar actually paints on a long run.
          await new Promise((res) => setTimeout(res, 0))
        }
      }

      doc.save(`Poster_${totalW}x${totalH}cm.pdf`)
      toast.success(`បានបង្កើត PDF ចំនួន ${toKhmerNumber(plan.sheets)} សន្លឹក`)
    } catch (e) {
      logger.error(e)
      toast.error('បង្កើត PDF មិនបានសម្រេច')
    } finally {
      setBusy(false)
      setProgress(0)
    }
  }

  const numberField = (
    id: string,
    label: string,
    value: number,
    onChange: (n: number) => void,
    suffix: string,
    min = 0,
  ) => (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold text-text-body">
        {label} <span className="font-normal text-text-muted">({suffix})</span>
      </label>
      <input
        id={id}
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-11 w-full rounded-xl border border-divider bg-white p-2.5 text-center font-bold outline-none transition focus:border-brand dark:border-divider dark:bg-bg-app"
      />
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-8">
      <Link
        href="/decorations"
        className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/60 px-4 py-2 font-bold text-brand shadow-sm backdrop-blur-sm transition hover:text-brand-800"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" /> ត្រឡប់ទៅសម្ភារៈតុបតែង
      </Link>

      <div className="rounded-xl border border-divider bg-bg-surface p-6 shadow-lg md:p-8">
        <div className="mb-6 flex items-center gap-3 border-b border-divider pb-4">
          <div className="rounded-full bg-brand-100 p-3 text-brand dark:bg-brand-900 dark:text-brand-300">
            <Scissors className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="kh-moul text-xl text-brand md:text-2xl dark:text-brand-300">បំបែកសន្លឹក Poster</h1>
            <p className="mt-1 text-sm text-text-muted">
              បំបែករូបភាពធំមួយ ទៅជាសន្លឹកតូចៗ ដើម្បីបោះពុម្ពដោយម៉ាស៊ីនធម្មតា
            </p>
          </div>
        </div>

        {/* Upload */}
        <div className="mb-6">
          <input
            ref={inputRef}
            id="poster-file"
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex min-h-11 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-divider bg-brand-100/50 px-4 py-8 text-center transition hover:border-brand-400 hover:bg-brand-100 dark:border-divider dark:bg-bg-surface/50"
          >
            <ImageUp className="h-8 w-8 text-brand" aria-hidden="true" />
            <span className="font-bold text-brand dark:text-brand-300">
              {fileName || 'ជ្រើសរើសរូបភាព Poster'}
            </span>
            <span className="text-xs text-text-muted">
              រូបភាពមិនត្រូវបានផ្ទុកឡើងទៅម៉ាស៊ីនមេទេ — ដំណើរការក្នុងកម្មវិធីរុករកតែប៉ុណ្ណោះ
            </span>
          </button>
        </div>

        {preview && (
          <div className="mb-6 overflow-hidden rounded-xl border border-divider">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL for a user-picked file; next/image cannot optimise a blob and would only add a network hop */}
            <img src={preview} alt="Poster preview" className="max-h-64 w-full object-contain bg-paper dark:bg-bg-app" />
          </div>
        )}

        {/* Settings */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {numberField('poster-w', 'ទទឹង', totalW, setTotalW, 'សម', 1)}
          {numberField('poster-h', 'កម្ពស់', totalH, setTotalH, 'សម', 1)}
          <div>
            <label htmlFor="poster-paper" className="mb-1 block text-sm font-bold text-text-body">ទំហំក្រដាស</label>
            <Select
              id="poster-paper"
              ariaLabel="ទំហំក្រដាស"
              value={paper}
              onChange={(v) => setPaper(v as PaperSizeKey)}
              options={Object.entries(PAPER_SIZES).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </div>
          <div>
            <label htmlFor="poster-orient" className="mb-1 block text-sm font-bold text-text-body">ទិសក្រដាស</label>
            <Select
              id="poster-orient"
              ariaLabel="ទិសក្រដាស"
              value={orientation}
              onChange={(v) => setOrientation(v as Orientation)}
              options={[
                { value: 'p', label: 'បញ្ឈរ' },
                { value: 'l', label: 'ផ្តេក' },
              ]}
            />
          </div>
          {numberField('poster-margin', 'រឹមក្រដាស', margin, setMargin, 'មម')}
          {numberField('poster-overlap', 'ចន្លោះត្រួតគ្នា', overlap, setOverlap, 'មម')}
        </div>

        <label className="mb-6 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-paper px-4 dark:bg-bg-surface">
          <input
            type="checkbox"
            checked={includeGuide}
            onChange={(e) => setIncludeGuide(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          <span className="text-sm font-bold text-text-body">បន្ថែមទំព័រណែនាំការតម្រៀប (Layout Guide)</span>
        </label>

        {/* Plan summary */}
        <div
          className={`mb-6 flex items-center gap-3 rounded-xl px-4 py-3 text-sm ${
            plan.error
              ? 'bg-danger/10 text-danger dark:bg-danger/10 dark:text-danger'
              : 'bg-success/10 text-success dark:bg-success/10 dark:text-success'
          }`}
        >
          <Grid3x3 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {plan.error ? (
            plan.error
          ) : (
            <span>
              តម្រៀប <b>{toKhmerNumber(plan.cols)} × {toKhmerNumber(plan.rows)}</b> — សរុប{' '}
              <b>{toKhmerNumber(plan.sheets)}</b> សន្លឹក
            </span>
          )}
        </div>

        <button
          onClick={generate}
          disabled={!image || busy || !!plan.error}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 font-bold text-white shadow-md transition hover:bg-brand-hover disabled:opacity-50"
        >
          {busy ? (
            <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> កំពុងបង្កើត... {toKhmerNumber(progress)}%</>
          ) : (
            <><Download className="h-5 w-5" aria-hidden="true" /> ទាញយក PDF</>
          )}
        </button>

        {busy && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-divider dark:bg-paper">
            <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}
