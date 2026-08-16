import { useState, useRef, type ReactNode, type InputHTMLAttributes } from 'react'
import { AlertCircle, Camera, CheckCircle2, Image as ImageIcon, Smile, User, Bot, UploadCloud, X, Trash2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'

export const inputClassName = [
  'min-h-11 w-full rounded-xl border border-divider bg-bg-surface px-3.5 py-2.5 text-[16px] text-text-heading',
  'placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus-ring/30',
  'disabled:cursor-not-allowed disabled:bg-paper disabled:text-text-muted',
  'dark:bg-bg-surface dark:text-text-heading transition-colors',
].join(' ')

export const errorInputClassName = [
  'min-h-11 w-full rounded-xl border border-danger bg-danger/5 px-3.5 py-2.5 text-[16px] text-text-heading',
  'placeholder:text-text-muted focus:border-danger focus:outline-none focus:ring-2 focus:ring-danger/30',
  'dark:bg-danger/10 dark:text-text-heading transition-colors',
].join(' ')


// -- TextField --
type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
  wrapperClassName?: string
}

export function TextField({
  label,
  hint,
  error,
  wrapperClassName = '',
  className = '',
  id,
  name,
  required,
  ...props
}: TextFieldProps) {
  const fieldId = id ?? name

  return (
    <div className={wrapperClassName}>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-bold text-text-body">
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </label>
      <input
        id={fieldId}
        name={name}
        required={required}
        className={`${error ? errorInputClassName : inputClassName} ${className}`}
        aria-invalid={!!error}
        {...props}
      />
      {error && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-danger">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}
      {!error && hint && <p className="mt-1.5 text-xs leading-5 text-text-muted">{hint}</p>}
    </div>
  )
}

// -- Enrollment Section --
export function EnrollmentSection({
  number,
  title,
  description,
  icon: Icon,
  children,
  id,
}: {
  number: string
  title: string
  description: string
  icon: LucideIcon
  children: ReactNode
  id: string
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm sm:p-6 mb-6">
      <header className="mb-5 flex items-start gap-3 border-b border-divider pb-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-extrabold text-brand-contrast shadow-sm">
          {number}
        </span>
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-extrabold text-text-heading">{title}</h2>
          <p className="mt-0.5 text-sm leading-6 text-text-muted">{description}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

// -- Photo Uploader --
export function PhotoUploader({
  photoUrl,
  onPhotoChange,
  onOpenAvatarModal,
}: {
  photoUrl: string
  onPhotoChange: (url: string) => void
  onOpenAvatarModal: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [urlInput, setUrlInput] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    const file =
      'dataTransfer' in event
        ? event.dataTransfer.files?.[0]
        : (event.target as HTMLInputElement).files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      alert('ទំហំរូបថតធំពេក។ សូមជ្រើសរើសរូបដែលតូចជាង 5MB។') // using alert temporarily
      return
    }

    const reader = new FileReader()
    reader.onload = (loadEvent) => onPhotoChange(loadEvent.target?.result as string)
    reader.readAsDataURL(file)
  }

  const applyUrlPhoto = () => {
    let finalUrl = urlInput.trim()
    if (!finalUrl) return

    if (finalUrl.includes('drive.google.com')) {
      const matchFileD = finalUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
      const matchId = finalUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/)
      const fileId = matchFileD ? matchFileD[1] : matchId ? matchId[1] : null
      if (fileId) finalUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`
    }
    onPhotoChange(finalUrl)
    setUrlInput('')
  }

  return (
    <div className="rounded-2xl border border-divider bg-paper p-4 flex flex-col items-center">
      <div
        className={`group relative flex h-40 w-40 flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-colors ${
          isDragging ? 'border-brand bg-brand/5' : 'border-brand/30 bg-bg-surface hover:border-brand/70'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          handlePhotoUpload(e)
        }}
        onClick={() => !photoUrl && fileInputRef.current?.click()}
      >
        {photoUrl ? (
          <>
            <img src={photoUrl} alt="Student" className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onPhotoChange('')
                }}
                className="rounded-full bg-danger p-2 text-white hover:bg-danger/80"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-text-muted">
            <UploadCloud className="h-8 w-8" />
            <span className="text-xs font-bold">ទាញទម្លាក់ ឬចុចទីនេះ</span>
          </div>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handlePhotoUpload} />
      
      <div className="mt-4 flex w-full flex-col gap-2">
        <Button type="button" size="sm" variant="secondary" icon={<Smile className="h-4 w-4" />} onClick={onOpenAvatarModal}>
          ជ្រើសរូបតុក្កតា
        </Button>
        <div className="flex w-full items-center gap-2">
          <input
            type="url"
            className={`${inputClassName} h-9 py-1 px-2 text-sm`}
            placeholder="URL រូបភាព..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <Button type="button" size="sm" variant="secondary" onClick={applyUrlPhoto}>
            ភ្ជាប់
          </Button>
        </div>
      </div>
    </div>
  )
}


// -- Avatar Picker Modal --

/**
 * The DiceBear styles offered, and the single source of the tab union.
 *
 * `as const` makes `AvatarStyle` the literal union of the three ids, so the tab
 * buttons no longer need a cast to satisfy `setActiveTab`.
 */
const AVATAR_TABS = [
  { id: 'notionists', label: 'តុក្កតា', icon: Smile },
  { id: 'adventurer', label: 'មនុស្ស', icon: User },
  { id: 'bottts', label: 'រ៉ូបូត', icon: Bot },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[]

type AvatarStyle = (typeof AVATAR_TABS)[number]['id']

export function AvatarPickerModal({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean
  onClose: () => void
  onSelect: (url: string) => void
}) {
  const [activeTab, setActiveTab] = useState<AvatarStyle>('notionists')
  if (!isOpen) return null

  const seeds = [1, 3, 6, 9, 10, 13, 15, 17, 18, 19, 20, 23, 29, 52, 54, 58, 59, 64, 65, 68, 74, 75, 84, 85, 88, 91, 92, 99, 100, 101, 105, 110]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
      <div role="dialog" className="w-full max-w-2xl overflow-hidden rounded-2xl bg-bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-divider p-4">
          <h2 className="font-extrabold text-text-heading">ជ្រើសរើសរូបតំណាង</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-text-muted hover:bg-paper hover:text-danger">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex border-b border-divider bg-paper px-4 pt-2">
          {AVATAR_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 font-bold transition-colors ${
                activeTab === tab.id ? 'border-brand text-brand' : 'border-transparent text-text-muted hover:text-text-heading'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
        <div className="grid max-h-[50vh] grid-cols-4 gap-3 overflow-y-auto p-4 sm:grid-cols-6 lg:grid-cols-8">
          {seeds.map((seed) => (
            <button
              key={`${activeTab}-${seed}`}
              type="button"
              onClick={() => {
                onSelect(`https://api.dicebear.com/7.x/${activeTab}/svg?seed=${seed}`)
                onClose()
              }}
              className="overflow-hidden rounded-xl border-2 border-transparent bg-paper p-2 transition hover:border-brand focus:border-brand focus:outline-none"
            >
              <img src={`https://api.dicebear.com/7.x/${activeTab}/svg?seed=${seed}`} alt={`រូបលេខ ${seed}`} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
