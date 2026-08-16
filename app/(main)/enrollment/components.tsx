"use client"

/**
 * Presentational pieces of `/enrollment`.
 *
 * These lived inside `page.tsx` as a 500-line preamble while an unused copy of
 * three of them sat in this file. One set now, exported, so the page reads as
 * the flow it is.
 */

import { useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react"
import {
  AlertCircle, Camera, Check, ChevronRight, ImageIcon, Link2, Loader2,
  Smile, Trash2, type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/actions/Button"
import { Dialog } from "@/components/ui/overlay/Dialog"
import { notify } from "@/components/ui/feedback/notify"
import { getDriveImageUrl } from "@/lib/utils/drive-image"
import { compressImageFile, dataUrlBytes } from "@/lib/utils/image"
import { toKhmerNumber } from "@/lib/utils/khmer-num"
import { getErrorMessage } from "@/lib/utils/errors"
import { logger } from "@/lib/utils/logger"

import {
  SECTIONS, sectionProgress, requiredProgress,
  type EnrollmentValues, type FieldErrors, type SectionId, type SectionState,
} from "./formState"

/* ─── Field styling ─── */

/**
 * `text-base` rather than `text-sm`: below 16px iOS Safari zooms the viewport
 * on focus and never zooms back out, which on a long form leaves the teacher
 * scrolling sideways for the rest of the page.
 */
const inputBase = [
  "min-h-11 w-full rounded-lg border bg-bg-surface px-3.5 py-2.5 text-base text-text-heading",
  "placeholder:text-text-muted focus:outline-none focus:ring-2",
  "disabled:cursor-not-allowed disabled:bg-paper disabled:text-text-muted",
  "transition-colors",
].join(" ")

const inputIdle = "border-divider hover:border-brand/60 focus:border-brand focus:ring-focus-ring/30"
const inputInvalid = "border-danger bg-danger/5 focus:border-danger focus:ring-danger/25"

/* ─── TextField ─── */

export function TextField({
  label, hint, error, wrapperClassName = "", className = "",
  id, name, required, ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
  wrapperClassName?: string
}) {
  const generated = useId()
  const fieldId = id ?? name ?? generated
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined

  return (
    <div className={wrapperClassName}>
      <label htmlFor={fieldId} className="mb-1.5 flex items-center gap-1 text-sm font-bold text-text-body">
        {label}
        {required && <span className="text-danger" aria-hidden="true">*</span>}
        {required && <span className="sr-only">(ចាំបាច់)</span>}
      </label>
      <input
        id={fieldId}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[inputBase, error ? inputInvalid : inputIdle, className].join(" ")}
        {...props}
      />
      {/* `role="alert"` so a screen reader announces the problem instead of
          leaving it as red text the user cannot see. */}
      {error && (
        <p id={`${fieldId}-error`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-bold text-danger">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-xs leading-5 text-text-muted">{hint}</p>
      )}
    </div>
  )
}

/** Label + error wrapper for a `SearchableSelect`, which brings its own control. */
export function LocationField({
  label, required, error, children,
}: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1 text-sm font-bold text-text-body">
        {label}
        {required && <span className="text-danger" aria-hidden="true">*</span>}
      </p>
      {children}
      {error && (
        <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-bold text-danger">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}

/* ─── Section status chrome ─── */

/**
 * Status is carried by shape *and* colour — an icon plus a word — so it still
 * reads for the ~8% of men with a red/green deficiency, who are well
 * represented among Cambodian primary teachers.
 */
const STATE_BADGE: Record<SectionState, { className: string; label: string } | null> = {
  done: { className: "bg-success/10 text-success", label: "បំពេញរួច" },
  error: { className: "bg-danger/10 text-danger", label: "ត្រូវពិនិត្យ" },
  partial: { className: "bg-brand/10 text-brand", label: "កំពុងបំពេញ" },
  todo: null,
}

function StateMark({ state, index }: { state: SectionState; index: number }) {
  const base = "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold transition-colors"
  if (state === "done") return <span className={`${base} bg-success text-white`}><Check className="h-4 w-4" aria-hidden="true" /></span>
  if (state === "error") return <span className={`${base} bg-danger text-white`}><AlertCircle className="h-4 w-4" aria-hidden="true" /></span>
  if (state === "partial") return <span className={`${base} bg-brand text-brand-contrast`}>{toKhmerNumber(index + 1)}</span>
  return <span className={`${base} bg-paper text-text-muted`}>{toKhmerNumber(index + 1)}</span>
}

export function SectionCard({
  section, state, errorCount, children,
}: {
  section: (typeof SECTIONS)[number]
  state: SectionState
  errorCount: number
  children: ReactNode
}) {
  const Icon = section.icon
  const badge = STATE_BADGE[state]

  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-title`}
      className="scroll-mt-24 rounded-xl border border-divider bg-bg-surface p-4 shadow-sm transition-shadow focus-within:shadow-md sm:p-6"
    >
      <header className="mb-5 flex items-start gap-3 border-b border-divider pb-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${section.id}-title`} className="text-base font-extrabold text-text-heading">
              <span className="text-text-muted">{section.number}.</span> {section.title}
            </h2>
            {badge && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${badge.className}`}>
                {state === "done" ? <Check className="h-3 w-3" aria-hidden="true" /> : state === "error" ? <AlertCircle className="h-3 w-3" aria-hidden="true" /> : null}
                {state === "error" && errorCount > 0 ? `${badge.label} ${toKhmerNumber(errorCount)}` : badge.label}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-6 text-text-muted">{section.description}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

/* ─── Progress navigation ─── */

interface NavProps {
  values: EnrollmentValues
  errors: FieldErrors
  activeSection: SectionId
  onNavigate: (id: SectionId) => void
}

/** Desktop rail: overall progress plus a jump list that doubles as a status board. */
export function ProgressRail({ values, errors, activeSection, onNavigate }: NavProps) {
  const { done, total, percent } = requiredProgress(values)

  return (
    <nav
      aria-label="ផ្នែកនៃការចុះឈ្មោះ"
      className="sticky top-20 hidden h-fit w-60 shrink-0 rounded-xl border border-divider bg-bg-surface p-4 shadow-sm xl:block print:hidden"
    >
      <p className="text-xs font-extrabold uppercase tracking-wider text-text-muted">ព័ត៌មានចាំបាច់</p>
      <p className="mt-1 text-2xl font-extrabold text-text-heading">
        {toKhmerNumber(done)}<span className="text-base text-text-muted">/{toKhmerNumber(total)}</span>
      </p>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-paper"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="វឌ្ឍនភាពនៃការបំពេញ"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${percent === 100 ? "bg-success" : "bg-brand"}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="mt-4 space-y-0.5">
        {SECTIONS.map((section, index) => {
          const progress = sectionProgress(section, values, errors)
          const isActive = activeSection === section.id
          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => onNavigate(section.id)}
                aria-current={isActive ? "true" : undefined}
                className={[
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-bold transition-colors",
                  isActive ? "bg-brand/10 text-brand" : "text-text-body hover:bg-paper",
                ].join(" ")}
              >
                <StateMark state={progress.state} index={index} />
                <span className="min-w-0 flex-1 truncate">{section.label}</span>
                {progress.requiredTotal > 0 ? (
                  <span className="shrink-0 text-[11px] font-extrabold tabular-nums text-text-muted">
                    {toKhmerNumber(progress.requiredDone)}/{toKhmerNumber(progress.requiredTotal)}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-paper px-1.5 py-0.5 text-[10px] font-bold text-text-muted">
                    ស្រេចចិត្ត
                  </span>
                )}
                {isActive && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * Phone/tablet equivalent. `top-14` clears the app's sticky top bar — at
 * `top-0` this slid underneath it and the labels were unreadable while
 * scrolling.
 */
export function SectionChips({ values, errors, activeSection, onNavigate }: NavProps) {
  const { done, total, percent } = requiredProgress(values)

  return (
    <nav
      aria-label="ផ្នែកនៃការចុះឈ្មោះ"
      className="sticky top-14 z-30 -mx-4 mb-4 border-b border-divider bg-bg-app/95 px-4 py-2.5 backdrop-blur xl:hidden print:hidden"
    >
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 rounded-lg bg-brand/10 px-2 py-1 text-xs font-extrabold tabular-nums text-brand">
          {toKhmerNumber(done)}/{toKhmerNumber(total)}
        </span>
        <div className="-mx-1 flex flex-1 items-center gap-1.5 overflow-x-auto px-1 pb-1">
          {SECTIONS.map((section, index) => {
            const progress = sectionProgress(section, values, errors)
            const isActive = activeSection === section.id
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onNavigate(section.id)}
                aria-current={isActive ? "true" : undefined}
                className={[
                  "flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors",
                  isActive
                    ? "border-brand bg-brand text-brand-contrast"
                    : progress.state === "error"
                      ? "border-danger/40 bg-danger/10 text-danger"
                      : progress.state === "done"
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-divider bg-bg-surface text-text-muted",
                ].join(" ")}
              >
                {progress.state === "done" ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : progress.state === "error" ? (
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <span className="text-[10px] opacity-70">{toKhmerNumber(index + 1)}</span>
                )}
                <span className="whitespace-nowrap">{section.label}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div
        className="mt-1 h-1 overflow-hidden rounded-full bg-paper"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="វឌ្ឍនភាពនៃការបំពេញ"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${percent === 100 ? "bg-success" : "bg-brand"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </nav>
  )
}

/* ─── Status group ─── */

export function StatusGroup({
  title, icon: Icon, tone = "brand", children,
}: {
  title: string
  icon: LucideIcon
  tone?: "brand" | "success" | "warning"
  children: ReactNode
}) {
  const tones = {
    brand: "bg-brand/10 text-brand",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
  } as const

  return (
    <div className="rounded-lg border border-divider bg-paper p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="text-sm font-extrabold text-text-heading">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

/* ─── Photo ─── */

const AVATAR_TABS = [
  { id: "notionists", label: "តុក្កតា" },
  { id: "avataaars", label: "មនុស្ស" },
  { id: "bottts", label: "រ៉ូបូត" },
] as const

const AVATAR_SEEDS = [1, 3, 6, 9, 10, 13, 15, 17, 18, 19, 20, 23, 29, 52, 54, 58, 59, 64, 65, 68, 74, 75, 84, 88]

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export function PhotoPanel({
  value, onChange,
}: {
  value: string
  onChange: (url: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [urlInput, setUrlInput] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showAvatars, setShowAvatars] = useState(false)
  const [avatarTab, setAvatarTab] = useState<(typeof AVATAR_TABS)[number]["id"]>("notionists")

  const accept = async (file: File | undefined | null) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      notify.error("សូមជ្រើសរើសឯកសាររូបភាពប៉ុណ្ណោះ។")
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      notify.error("ទំហំរូបថតធំពេក។ សូមជ្រើសរើសរូបតូចជាង ៨MB។")
      return
    }
    setIsProcessing(true)
    try {
      // Downscaled before it becomes a data URL: the raw file goes into
      // `students.photo_url` and is re-read on every roster load.
      const dataUrl = await compressImageFile(file)
      onChange(dataUrl)
      notify.success(`បានបន្ថែមរូបថត (${toKhmerNumber(Math.max(1, Math.round(dataUrlBytes(dataUrl) / 1024)))}KB)`)
    } catch (err) {
      logger.error("photo compress:", err)
      notify.error(`មិនអាចអានរូបភាពបានទេ៖ ${getErrorMessage(err)}`)
    } finally {
      setIsProcessing(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const applyUrl = () => {
    const raw = urlInput.trim()
    if (!raw) {
      notify.error("សូមបញ្ចូលតំណភ្ជាប់រូបភាពជាមុនសិន។")
      return
    }
    onChange(getDriveImageUrl(raw))
    setUrlInput("")
    notify.success("បានកំណត់រូបភាពពីតំណភ្ជាប់។")
  }

  return (
    <div className="rounded-lg border border-divider bg-paper p-4">
      <p className="text-center text-sm font-extrabold text-text-heading">រូបថតសិស្ស</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); void accept(e.dataTransfer.files?.[0]) }}
        className={[
          "group relative mx-auto mt-3 flex h-36 w-36 items-center justify-center overflow-hidden rounded-xl border-2 transition-colors",
          isDragging ? "border-brand bg-brand/5" : value ? "border-solid border-divider" : "border-dashed border-brand/40 bg-bg-surface",
        ].join(" ")}
      >
        {isProcessing ? (
          <Loader2 className="h-7 w-7 animate-spin text-brand motion-reduce:animate-none" aria-hidden="true" />
        ) : value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied remote or inline photo; next/image needs an allow-listed host and adds nothing at 144px */}
            <img
              src={value}
              alt="រូបថតសិស្សដែលបានជ្រើសរើស"
              className="h-full w-full object-cover"
              onError={() => { onChange(""); notify.error("មិនអាចបង្ហាញរូបភាពពីតំណភ្ជាប់នេះបានទេ។") }}
            />
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="លុបរូបថត"
              className="tap-target absolute right-1 top-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-black/55 text-white opacity-100 transition hover:bg-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        ) : (
          // A real button, not a div with a drop handler: the previous version
          // could only be reached with a mouse that had a file attached to it.
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1.5 text-text-muted transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring"
          >
            <ImageIcon className="h-7 w-7" aria-hidden="true" />
            <span className="text-xs font-bold">បន្ថែមរូបថត</span>
            <span className="text-[10px]">ឬទម្លាក់រូបនៅទីនេះ</span>
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" size="sm" variant="secondary" icon={<Camera className="h-3.5 w-3.5" />}
          onClick={() => fileRef.current?.click()} disabled={isProcessing}>
          ផ្ទុកឡើង
        </Button>
        <Button type="button" size="sm" variant="secondary" icon={<Smile className="h-3.5 w-3.5" />}
          onClick={() => setShowAvatars(true)}>
          រូបតុក្កតា
        </Button>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <label htmlFor="photo-url" className="sr-only">តំណភ្ជាប់រូបភាព</label>
        <input
          id="photo-url"
          type="url"
          inputMode="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyUrl() } }}
          placeholder="https://... ឬ Google Drive"
          className="min-h-9 min-w-0 flex-1 rounded-lg border border-divider bg-bg-surface px-2.5 py-1.5 text-sm text-text-heading placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus-ring/30"
        />
        <Button type="button" size="sm" variant="ghost" onClick={applyUrl} aria-label="ប្រើតំណភ្ជាប់រូបភាព">
          <Link2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <p className="mt-2 text-center text-[11px] leading-5 text-text-muted">
        រូបថតនឹងត្រូវបង្រួមដោយស្វ័យប្រវត្តិ ដើម្បីកុំឱ្យបញ្ជីសិស្សដំណើរការយឺត។
      </p>

      <input ref={fileRef} type="file" accept="image/*" className="sr-only"
        onChange={(e) => void accept(e.target.files?.[0])} />

      <Dialog
        open={showAvatars}
        onClose={() => setShowAvatars(false)}
        size="lg"
        title="ជ្រើសរើសរូបតំណាង"
        description="សម្រាប់សិស្សដែលមិនទាន់មានរូបថត។"
      >
        <div role="tablist" aria-label="ប្រភេទរូបតំណាង" className="flex gap-1 rounded-lg bg-paper p-1">
          {AVATAR_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={avatarTab === tab.id}
              onClick={() => setAvatarTab(tab.id)}
              className={[
                "min-h-9 flex-1 cursor-pointer rounded-md px-3 text-xs font-bold transition-colors",
                avatarTab === tab.id ? "bg-bg-surface text-brand shadow-sm" : "text-text-muted hover:text-text-body",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {AVATAR_SEEDS.map((seed) => {
            const url = `https://api.dicebear.com/7.x/${avatarTab}/svg?seed=${seed}`
            return (
              <button
                key={`${avatarTab}-${seed}`}
                type="button"
                onClick={() => { onChange(url); setShowAvatars(false); notify.success("បានជ្រើសរូបតំណាង។") }}
                className="cursor-pointer overflow-hidden rounded-lg border-2 border-transparent bg-paper p-1 transition-colors hover:border-brand focus-visible:border-brand focus-visible:outline-none"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- remote SVG avatar; next/image cannot optimise it and the host is external */}
                <img src={url} alt={`រូបតំណាងលេខ ${toKhmerNumber(seed)}`} loading="lazy" className="aspect-square w-full" />
              </button>
            )
          })}
        </div>
      </Dialog>
    </div>
  )
}
