'use client'

import { useState } from 'react'
import { FilePlus2, Info, Send } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { controlClass, fieldLabel, requiredMark } from '@/components/ui/forms/fieldStyles'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { formatKhmerDate, toISODate } from '@/lib/utils/date'
import { HOMEWORK_SUBJECT_OPTIONS } from './subjects'
import { HomeworkDueDateField } from './HomeworkDueDateField'
import { HomeworkAttachmentField } from './HomeworkAttachmentField'
import { HomeworkPreview } from './HomeworkPreview'
import { isPastDate } from './assignmentStatus'

/**
 * Composing one assignment.
 *
 * The form owns its own draft; the caller owns the write. `onPublish` resolves
 * `true` when the row was created, which is the only thing that clears the
 * fields — a failed publish must never wipe what the teacher typed.
 *
 * The title truncates in the parent portal's list, so the counter says so at
 * the point it starts to matter rather than imposing a limit the column does
 * not have. The due date is confirmed, not blocked, when it is already past.
 */

/** Where the portal's `truncate` starts to bite on a phone-width card. */
const TITLE_SOFT_LIMIT = 60

export interface HomeworkDraft {
  subject: string
  title: string
  description: string
  dueDate: string
  imageDataUrl: string | null
}

export interface HomeworkComposerProps {
  onPublish: (draft: HomeworkDraft) => Promise<boolean>
  /** Uploading + inserting. Keeps the button size stable and blocks re-submit. */
  submitting: boolean
  onError: (message: string) => void
}

/** Tomorrow, in local time — the sensible default for work set today. */
function defaultDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toISODate(d)
}

export function HomeworkComposer({ onPublish, submitting, onError }: HomeworkComposerProps) {
  const [subject, setSubject] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState(defaultDueDate)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const { confirm, dialog } = useConfirm()

  const missing = {
    subject: subject.trim() === '',
    title: title.trim() === '',
    dueDate: dueDate === '',
  }
  const incomplete = missing.subject || missing.title || missing.dueDate

  const reset = () => {
    setSubject('')
    setTitle('')
    setDescription('')
    setDueDate(defaultDueDate())
    setImageDataUrl(null)
    setFileName(null)
    setTouched(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (incomplete || submitting) return

    if (
      isPastDate(dueDate) &&
      !(await confirm({
        title: 'ថ្ងៃផុតកំណត់កន្លងផុតទៅហើយ',
        message: `ថ្ងៃផុតកំណត់ដែលបានជ្រើសរើសគឺ ${formatKhmerDate(dueDate)} ដែលកន្លងផុតទៅហើយ។ កិច្ចការនឹងបង្ហាញជា «ហួសកំណត់» ភ្លាមៗនៅក្នុងកម្មវិធីអាណាព្យាបាល។`,
        tone: 'warning',
        confirmLabel: 'ផ្សាយទោះជាយ៉ាងណា',
      }))
    ) {
      return
    }

    const ok = await onPublish({
      subject: subject.trim(),
      title: title.trim(),
      description: description.trim(),
      dueDate,
      imageDataUrl,
    })
    if (ok) reset()
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h2 className="kh-moul flex items-center gap-2 border-b border-divider pb-3 text-base text-brand">
        <FilePlus2 className="h-5 w-5" aria-hidden="true" /> បង្កើតកិច្ចការថ្មី
      </h2>

      {/* ------------------------------------------------------------ subject */}
      <div>
        {/*
          The visible label comes from the component itself: the trigger is a
          <button>, and a `<label for>` pointing at one associates with nothing.
        */}
        <SearchableSelect
          id="hw-subject"
          label="មុខវិជ្ជា"
          required
          placeholder="-- ជ្រើសរើសមុខវិជ្ជា --"
          value={subject}
          onChange={setSubject}
          options={HOMEWORK_SUBJECT_OPTIONS}
        />
        {touched && missing.subject && (
          <p role="alert" className="mt-1.5 text-xs font-bold text-danger">
            សូមជ្រើសរើសមុខវិជ្ជា
          </p>
        )}
      </div>

      {/* -------------------------------------------------------------- title */}
      <div>
        <label className={fieldLabel} htmlFor="hw-title">
          ចំណងជើងកិច្ចការ <span className={requiredMark}>*</span>
        </label>
        <input
          id="hw-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ឧ. លំហាត់គណិតវិទ្យា ទំព័រ ១២ លេខ ១ ដល់ ៥"
          aria-invalid={touched && missing.title ? true : undefined}
          aria-describedby="hw-title-hint"
          className={controlClass(false)}
        />
        <p id="hw-title-hint" className="mt-1.5 text-[11px] text-text-muted">
          {title.length > TITLE_SOFT_LIMIT ? (
            <span className="font-bold text-warning">
              ចំណងជើងវែង ({toKhmerNumber(title.length)} តួ) — អាចត្រូវកាត់ខ្លីក្នុងបញ្ជីរបស់អាណាព្យាបាល
            </span>
          ) : (
            <>សរសេរឱ្យខ្លី និងច្បាស់ · {toKhmerNumber(title.length)} តួអក្សរ</>
          )}
        </p>
        {touched && missing.title && (
          <p role="alert" className="mt-1 text-xs font-bold text-danger">
            សូមបញ្ចូលចំណងជើងកិច្ចការ
          </p>
        )}
      </div>

      {/* -------------------------------------------------------- instructions */}
      <div>
        <label className={fieldLabel} htmlFor="hw-description">
          ការណែនាំលម្អិត <span className="font-normal text-text-muted">(ជម្រើស)</span>
        </label>
        <textarea
          id="hw-description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="ឧ. សូមធ្វើក្នុងសៀវភៅលំហាត់ ហើយឱ្យអាណាព្យាបាលចុះហត្ថលេខា។"
          className="w-full rounded-lg border border-divider bg-bg-surface px-4 py-3 text-sm leading-relaxed text-text-heading outline-none transition hover:border-brand/60 focus:border-brand focus:ring-2 focus:ring-focus-ring/30"
        />
      </div>

      {/* --------------------------------------------------------- attachment */}
      <HomeworkAttachmentField
        value={imageDataUrl}
        fileName={fileName}
        disabled={submitting}
        onSelect={(dataUrl, file) => {
          setImageDataUrl(dataUrl)
          setFileName(file.name)
        }}
        onClear={() => {
          setImageDataUrl(null)
          setFileName(null)
        }}
        onError={onError}
      />

      {/* ----------------------------------------------------------- due date */}
      <HomeworkDueDateField value={dueDate} onChange={setDueDate} />

      {/* ------------------------------------------------------------ preview */}
      <HomeworkPreview
        subject={subject}
        title={title}
        description={description}
        dueDate={dueDate}
        imageDataUrl={imageDataUrl}
      />

      {/*
        Exactly who can read the row, stated plainly.

        The RLS policy on `homework_assignments` matches on the *teacher*
        (`is_teacher_of_my_child`), not on a class or a student, so an
        assignment is readable by every linked parent of every pupil this
        teacher is assigned to. A teacher holding two classes needs to know
        that before they publish something meant for one of them.
      */}
      <p className="flex items-start gap-2 rounded-lg bg-brand-100/60 px-3 py-2.5 text-xs leading-relaxed text-brand-800 dark:bg-brand-900/30 dark:text-brand-300">
        <Info className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          កិច្ចការនេះនឹងអាចមើលឃើញដោយអាណាព្យាបាលដែលបានភ្ជាប់ជាមួយសិស្សដែលអ្នកបង្រៀន —
          <strong> មិនកំណត់តាមថ្នាក់ដែលកំពុងជ្រើសរើសទេ</strong>។ ប្រព័ន្ធមិនកត់ត្រាថាតើអាណាព្យាបាលបានបើកមើលឬអត់។
        </span>
      </p>

      <Button
        type="submit"
        size="lg"
        printHidden={false}
        loading={submitting}
        disabled={submitting}
        icon={<Send className="h-5 w-5" />}
      >
        {submitting ? 'កំពុងផ្សាយ...' : 'ផ្សាយកិច្ចការ'}
      </Button>

      {dialog}
    </form>
  )
}

export default HomeworkComposer
