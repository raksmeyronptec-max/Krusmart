'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDown, ArrowUp, AlertTriangle, Eye, EyeOff, Info, Loader2,
  Pencil, Plus, RotateCcw, SlidersHorizontal, Table2,
} from 'lucide-react'

import { Button } from '@/components/ui/actions/Button'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { notify } from '@/components/ui/feedback/notify'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { Badge } from '@/components/ui/feedback/Badge'
import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { controlClass, fieldLabel, requiredMark } from '@/components/ui/forms/fieldStyles'
import Select from '@/components/ui/forms/Select'

import { DEFAULT_SCHEME_CONFIG } from '@/lib/grading/scheme'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import {
  coefficientFor, resolveTemplateEditor,
  type EditableSubject, type TemplateContext, type TemplateScoreType,
} from '@/lib/scores/template'
import type { ScoreTemplateSubjectRow } from '@/lib/types'
import {
  addClassSubject, getClassTemplateRows, resetClassTemplate,
  swapClassSubjectOrder, updateClassSubject,
} from './actions'

/**
 * មុខវិជ្ជាតាមថ្នាក់ — the class layer of the score template.
 *
 * A teacher can hide a subject the ministry list carries but their class does
 * not sit, rename one to the wording their school uses, reorder the list to
 * match their register, change a full mark, and add a subject of their own.
 * Everything else keeps inheriting, which is why nothing is written until they
 * actually change something: materialising fourteen copies on first visit would
 * quietly cut this class off from every future change to the national default.
 *
 * Hiding, never deleting. `scores.subject` holds the subject key of every mark
 * ever entered, so removing a subject from the table would orphan them. A
 * hidden subject drops out of the picker and its history still resolves.
 *
 * Reordering is up/down rather than drag-and-drop, on purpose. This is a phone
 * screen inside a scrolling page: a touch drag has to fight the page's own
 * scroll, and getting it wrong means a teacher drops a subject somewhere they
 * did not intend. Two buttons are unambiguous, are 44px targets, work from the
 * keyboard and to a screen reader, and map exactly onto the two-row write the
 * server does.
 */

/**
 * The national scale divides by 50 (design §3.2), so a full mark that is a
 * multiple of 25 yields a coefficient in halves. Anything else is legal — a
 * private school may mark out of 68 — but is worth a second look, so it warns
 * rather than blocks. The inherited value never warns: 10 is the primary
 * default and a teacher who has not touched it has nothing to confirm.
 */
const NATIONAL_STEP = 25

function oddCoefficientWarning(maxScore: number, inheritedMax: number | null): string | null {
  if (!Number.isFinite(maxScore) || maxScore <= 0) return null
  if (inheritedMax !== null && maxScore === inheritedMax) return null
  if (maxScore % NATIONAL_STEP === 0) return null
  return `មេគុណ ${coefficientFor(maxScore)} — ប្រាកដទេ?`
}

const SCORE_TYPES: { id: TemplateScoreType; label: string }[] = [
  { id: 'monthly', label: 'ប្រចាំខែ' },
  { id: 'semester', label: 'ប្រចាំឆមាស' },
]

export default function ScoreSubjectsClient({
  initialRows,
  templateContext,
  classId,
  className,
}: {
  initialRows: ScoreTemplateSubjectRow[]
  /** The class's curriculum context; resolution filters by it (00021). */
  templateContext: TemplateContext | null
  classId: string | null
  className: string
}) {
  const [rows, setRows] = useState(initialRows)
  const [scoreType, setScoreType] = useState<TemplateScoreType>('monthly')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  const subjects = useMemo(
    () => resolveTemplateEditor(rows, scoreType, templateContext),
    [rows, scoreType, templateContext],
  )

  const refresh = useCallback(async () => {
    const next = await getClassTemplateRows(classId ?? undefined)
    // The system layer always has rows, so an empty result means the read
    // failed. Keeping what we had beats blanking a list the teacher is editing.
    if (next.length > 0) setRows(next)
  }, [classId])

  /** Run a write, report it in Khmer, and re-read the list it changed. */
  const run = useCallback(
    async (key: string, fn: () => Promise<{ error?: string; success?: boolean }>, okMessage: string) => {
      setBusyKey(key)
      try {
        const res = await fn()
        if (res.error) {
          notify.error(res.error)
          return false
        }
        await refresh()
        notify.success(okMessage)
        return true
      } finally {
        setBusyKey(null)
      }
    },
    [refresh],
  )

  // ------------------------------------------------------------------ edit
  const [editing, setEditing] = useState<EditableSubject | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editMax, setEditMax] = useState('')
  /** The odd-coefficient hint fires on a value the teacher typed, not on open. */
  const [editMaxTouched, setEditMaxTouched] = useState(false)

  const openEdit = (subject: EditableSubject) => {
    setEditing(subject)
    setEditLabel(subject.effective.labelKm)
    setEditMax(String(subject.effective.maxScore))
    setEditMaxTouched(false)
  }

  const editMaxNumber = Number(editMax)
  const inheritedMax = editing?.inherited ? Number(editing.inherited.max_score) : null
  const maxChanged = editing !== null && Number.isFinite(editMaxNumber) && editMaxNumber !== editing.effective.maxScore
  const oddWarning = editing ? oddCoefficientWarning(editMaxNumber, inheritedMax) : null

  const submitEdit = async () => {
    if (!editing) return
    if (!editLabel.trim()) {
      notify.error('សូមបញ្ចូលឈ្មោះមុខវិជ្ជា')
      return
    }
    if (!Number.isFinite(editMaxNumber) || editMaxNumber <= 0) {
      notify.error('ពិន្ទុពេញត្រូវតែធំជាងសូន្យ')
      return
    }

    const ok = await run(
      editing.subjectKey,
      () => updateClassSubject(editing.subjectKey, { label_km: editLabel.trim(), max_score: editMaxNumber }, classId ?? undefined),
      'បានរក្សាទុក',
    )
    if (ok) setEditing(null)
  }

  // ------------------------------------------------------------------- add
  const [addOpen, setAddOpen] = useState(false)
  const [newScoreType, setNewScoreType] = useState<TemplateScoreType>('monthly')
  const [newLabel, setNewLabel] = useState('')
  const [newMax, setNewMax] = useState(String(DEFAULT_SCHEME_CONFIG.maxScore))
  const [newColumns, setNewColumns] = useState('')

  const newMaxNumber = Number(newMax)
  const newOddWarning = oddCoefficientWarning(newMaxNumber, null)

  const submitAdd = async () => {
    if (!newLabel.trim()) {
      notify.error('សូមបញ្ចូលឈ្មោះមុខវិជ្ជា')
      return
    }
    if (!Number.isFinite(newMaxNumber) || newMaxNumber <= 0) {
      notify.error('ពិន្ទុពេញត្រូវតែធំជាងសូន្យ')
      return
    }

    const ok = await run(
      'add',
      () =>
        addClassSubject(
          {
            label_km: newLabel.trim(),
            max_score: newMaxNumber,
            score_type: newScoreType,
            column_labels: newColumns.split(',').map((c) => c.trim()).filter(Boolean),
          },
          classId ?? undefined,
        ),
      'បានបន្ថែមមុខវិជ្ជាថ្មី',
    )
    if (ok) {
      setAddOpen(false)
      setNewLabel('')
      setNewColumns('')
      setNewMax(String(DEFAULT_SCHEME_CONFIG.maxScore))
      // Land the teacher on the list they just added to.
      setScoreType(newScoreType)
    }
  }

  // ----------------------------------------------------------------- reset
  const doReset = async () => {
    const customised = rows.filter((r) => r.scope === 'class').length
    if (customised === 0) {
      notify.info('ថ្នាក់នេះមិនទាន់មានការកែប្រែទេ')
      return
    }

    const ok = await confirm({
      title: 'ត្រឡប់ទៅលំនាំដើម',
      message:
        `ការកែប្រែទាំង ${toKhmerNumber(customised)} នឹងត្រូវលុប៖ ឈ្មោះដែលបានប្តូរ លំដាប់ ពិន្ទុពេញ ` +
        'និងមុខវិជ្ជាដែលអ្នកបានបន្ថែមផ្ទាល់។ បញ្ជីនឹងត្រឡប់ទៅតាមលំនាំដើមរបស់ក្រសួងវិញ។ ' +
        'ពិន្ទុសិស្សដែលបានបញ្ចូលរួចមិនត្រូវបានលុបទេ ប៉ុន្តែមុខវិជ្ជាដែលអ្នកបានបន្ថែមនឹងលែងបង្ហាញក្នុងបញ្ជីទៀត។',
      tone: 'danger',
      confirmLabel: 'ត្រឡប់ទៅលំនាំដើម',
    })
    if (!ok) return

    await run('reset', () => resetClassTemplate(classId ?? undefined), 'បានត្រឡប់ទៅលំនាំដើម')
  }

  // ---------------------------------------------------------------- render
  const visibleCount = subjects.filter((s) => !s.hidden).length
  const customisedCount = subjects.filter((s) => s.override !== null).length

  if (!classId) {
    return (
      <PageContainer>
        <PageHeader
          title="មុខវិជ្ជាតាមថ្នាក់"
          description="កែបញ្ជីមុខវិជ្ជាសម្រាប់ថ្នាក់របស់អ្នក"
        />
        <div className="rounded-xl border border-divider bg-bg-surface">
          <EmptyState
            title="មិនទាន់មានថ្នាក់រៀន"
            description="ការកែបញ្ជីមុខវិជ្ជាធ្វើឡើងតាមថ្នាក់។ គណនីនេះមិនទាន់មានថ្នាក់ទេ ដូច្នេះវាកំពុងប្រើបញ្ជីមុខវិជ្ជាតាមលំនាំដើមរបស់ក្រសួង។"
            action={
              <Link
                href="/score/enter"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <Table2 className="h-4 w-4" aria-hidden="true" /> ត្រឡប់ទៅបញ្ចូលពិន្ទុ
              </Link>
            }
          />
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="មុខវិជ្ជាតាមថ្នាក់"
        description={
          className
            ? `កែបញ្ជីមុខវិជ្ជាសម្រាប់ថ្នាក់ ${className}`
            : 'កែបញ្ជីមុខវិជ្ជាសម្រាប់ថ្នាក់របស់អ្នក'
        }
        actions={
          <Link
            href="/score/enter"
            className="flex min-h-11 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-[13px] font-bold text-text-body transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Table2 className="h-4 w-4" aria-hidden="true" /> បញ្ចូលពិន្ទុ
          </Link>
        }
      />

      {/* -------------------------------------------------------- score type */}
      <div
        role="tablist"
        aria-label="ប្រភេទពិន្ទុ"
        className="mb-4 inline-flex w-full gap-1 rounded-xl bg-paper p-1 sm:w-auto"
      >
        {SCORE_TYPES.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={scoreType === id}
            onClick={() => setScoreType(id)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
              scoreType === id ? 'bg-brand text-brand-contrast shadow-md' : 'text-text-muted hover:text-brand'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ----------------------------------------------------------- summary */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-divider bg-bg-surface p-3 text-sm">
        <span className="flex items-center gap-2 font-bold text-text-heading">
          <SlidersHorizontal className="h-4 w-4 text-brand" aria-hidden="true" />
          មុខវិជ្ជាកំពុងប្រើ {toKhmerNumber(visibleCount)}
        </span>
        <span className="text-text-muted">
          បានកែ {toKhmerNumber(customisedCount)}
        </span>
        {/*
          The denominator of the class average, spelled out. The score screens
          use `simpleAverage`, so the divisor really is the number of subjects
          marked — not a sum of coefficients. Showing a coefficient total here
          would be a number that matches nothing the app computes.
        */}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-text-muted">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          មធ្យមភាគគិតដោយចែកនឹងចំនួនមុខវិជ្ជាដែលមានពិន្ទុ
        </span>
      </div>

      {/* ------------------------------------------------------------- list */}
      {subjects.length === 0 ? (
        <div className="rounded-xl border border-divider bg-bg-surface">
          <EmptyState
            kind="filtered"
            title="មិនទាន់មានមុខវិជ្ជាសម្រាប់ប្រភេទពិន្ទុនេះទេ"
            description="បន្ថែមមុខវិជ្ជាសម្រាប់ថ្នាក់នេះ ដើម្បីចាប់ផ្តើមបញ្ចូលពិន្ទុ។"
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {subjects.map((subject, index) => {
            const busy = busyKey === subject.subjectKey
            const max = subject.effective.maxScore
            const offNationalScale = max !== DEFAULT_SCHEME_CONFIG.maxScore

            return (
              <li
                key={subject.subjectKey}
                className={`rounded-xl border border-divider bg-bg-surface p-3 shadow-sm transition sm:p-4 ${
                  subject.hidden ? 'opacity-60' : ''
                }`}
              >
                <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                  {/* order */}
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      disabled={index === 0 || busy}
                      onClick={() =>
                        run(
                          subject.subjectKey,
                          () => swapClassSubjectOrder(subject.subjectKey, subjects[index - 1].subjectKey, classId ?? undefined),
                          'បានប្តូរលំដាប់',
                        )
                      }
                      aria-label={`ផ្លាស់ទី ${subject.effective.labelKm} ឡើងលើ`}
                      className="flex h-8 w-9 items-center justify-center rounded-md border border-divider text-text-muted transition hover:border-brand-400 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={index === subjects.length - 1 || busy}
                      onClick={() =>
                        run(
                          subject.subjectKey,
                          () => swapClassSubjectOrder(subject.subjectKey, subjects[index + 1].subjectKey, classId ?? undefined),
                          'បានប្តូរលំដាប់',
                        )
                      }
                      aria-label={`ផ្លាស់ទី ${subject.effective.labelKm} ចុះក្រោម`}
                      className="flex h-8 w-9 items-center justify-center rounded-md border border-divider text-text-muted transition hover:border-brand-400 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  {/* identity */}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-text-heading">{subject.effective.labelKm}</span>
                      {subject.isClassOwn ? (
                        <Badge variant="info" size="sm">គ្រូបន្ថែម</Badge>
                      ) : (
                        <Badge variant="muted" size="sm">ប្រព័ន្ធ</Badge>
                      )}
                      {subject.override && !subject.isClassOwn && (
                        <Badge variant="warning" size="sm">បានកែ</Badge>
                      )}
                      {subject.hidden && <Badge variant="danger" size="sm">បានលាក់</Badge>}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
                      <span>
                        ពិន្ទុពេញ <span className="font-bold text-text-body tabular-nums">{toKhmerNumber(max)}</span>
                      </span>
                      {/*
                        The coefficient is shown only once a subject has left the
                        national /10 scale. Printing `មេគុណ 0.2` beside all
                        fourteen primary subjects would teach a number that
                        multiplies nothing — `simpleAverage` is what the score
                        screens run, and `weightedAverage` has no callers yet.
                      */}
                      {offNationalScale && (
                        <span>
                          មេគុណ <span className="font-bold text-text-body tabular-nums">{coefficientFor(max)}</span>
                        </span>
                      )}
                      {subject.effective.columns.length > 1 && (
                        <span>ជួរឈរ {toKhmerNumber(subject.effective.columns.length)}</span>
                      )}
                    </p>
                  </div>

                  {/* actions */}
                  <div className="flex shrink-0 items-center gap-2">
                    {busy && <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden="true" />}
                    <Button
                      size="sm"
                      variant="secondary"
                      printHidden={false}
                      disabled={busy}
                      onClick={() =>
                        run(
                          subject.subjectKey,
                          () => updateClassSubject(subject.subjectKey, { hidden: !subject.hidden }, classId ?? undefined),
                          subject.hidden ? 'បានបង្ហាញឡើងវិញ' : 'បានលាក់មុខវិជ្ជា',
                        )
                      }
                    >
                      {subject.hidden ? (
                        <><Eye className="h-3.5 w-3.5" aria-hidden="true" /> បង្ហាញ</>
                      ) : (
                        <><EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> លាក់</>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      printHidden={false}
                      disabled={busy}
                      onClick={() => openEdit(subject)}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> កែ
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* ----------------------------------------------------------- footer */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          printHidden={false}
          onClick={() => { setNewScoreType(scoreType); setAddOpen(true) }}
          icon={<Plus className="h-4 w-4" />}
        >
          បន្ថែមមុខវិជ្ជា
        </Button>
        <Button variant="secondary" printHidden={false} onClick={doReset} disabled={busyKey === 'reset'}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> ត្រឡប់ទៅលំនាំដើម
        </Button>
      </div>

      {/* ------------------------------------------------------ edit dialog */}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="កែមុខវិជ្ជា"
        description={editing?.isClassOwn ? 'មុខវិជ្ជាដែលអ្នកបានបន្ថែមផ្ទាល់' : 'មុខវិជ្ជាតាមលំនាំដើមរបស់ក្រសួង'}
        footer={
          <>
            <Button variant="secondary" printHidden={false} onClick={() => setEditing(null)}>បោះបង់</Button>
            <Button printHidden={false} onClick={submitEdit} loading={busyKey === editing?.subjectKey}>រក្សាទុក</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className={fieldLabel} htmlFor="subject-label">
              ឈ្មោះមុខវិជ្ជា <span className={requiredMark}>*</span>
            </label>
            <input
              id="subject-label"
              type="text"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              className={controlClass(false, 'font-bold')}
            />
            <p className="mt-1.5 text-[11px] text-text-muted">
              ការប្តូរឈ្មោះមិនប៉ះពាល់ដល់ពិន្ទុដែលបានបញ្ចូលរួចទេ។
            </p>
          </div>

          <div>
            <label className={fieldLabel} htmlFor="subject-max">
              ពិន្ទុពេញ <span className={requiredMark}>*</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                id="subject-max"
                type="number"
                min={1}
                step="1"
                inputMode="decimal"
                value={editMax}
                onChange={(e) => { setEditMax(e.target.value); setEditMaxTouched(true) }}
                className={controlClass(false, 'w-32 text-center text-xl font-bold')}
              />
              {/*
                Derived, never typed. Two editable numbers that can disagree is
                exactly the drift design §3.2 avoids by not storing one.
              */}
              <p className="text-sm text-text-muted">
                មេគុណ{' '}
                <span className="font-bold text-text-heading tabular-nums">
                  {Number.isFinite(editMaxNumber) && editMaxNumber > 0 ? coefficientFor(editMaxNumber) : '—'}
                </span>
              </p>
            </div>

            {oddWarning && editMaxTouched && (
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {oddWarning}
              </p>
            )}

            {maxChanged && (
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-danger/10 p-2.5 text-xs text-danger">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ការប្តូរពិន្ទុពេញនឹងប៉ះពាល់ដល់មធ្យមភាគទាំងអស់ដែលបានគណនារួចសម្រាប់មុខវិជ្ជានេះ។
              </p>
            )}
          </div>
        </div>
      </Dialog>

      {/* ------------------------------------------------------- add dialog */}
      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="បន្ថែមមុខវិជ្ជាសម្រាប់ថ្នាក់"
        description="មុខវិជ្ជានេះនឹងបង្ហាញសម្រាប់ថ្នាក់នេះតែប៉ុណ្ណោះ"
        footer={
          <>
            <Button variant="secondary" printHidden={false} onClick={() => setAddOpen(false)}>បោះបង់</Button>
            <Button printHidden={false} onClick={submitAdd} loading={busyKey === 'add'}>រក្សាទុក</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className={fieldLabel} htmlFor="new-subject-label">
              ឈ្មោះមុខវិជ្ជា <span className={requiredMark}>*</span>
            </label>
            <input
              id="new-subject-label"
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className={controlClass(false, 'font-bold')}
              placeholder="ឧ. កុំព្យូទ័រ, ភាសាចិន..."
            />
          </div>

          <Select
            label="ប្រភេទពិន្ទុ"
            value={newScoreType}
            onChange={(v) => setNewScoreType(v as TemplateScoreType)}
            options={SCORE_TYPES.map((t) => ({ value: t.id, label: t.label }))}
          />

          <div>
            <label className={fieldLabel} htmlFor="new-subject-max">
              ពិន្ទុពេញ <span className={requiredMark}>*</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                id="new-subject-max"
                type="number"
                min={1}
                step="1"
                inputMode="decimal"
                value={newMax}
                onChange={(e) => setNewMax(e.target.value)}
                className={controlClass(false, 'w-32 text-center text-xl font-bold')}
              />
              <p className="text-sm text-text-muted">
                មេគុណ{' '}
                <span className="font-bold text-text-heading tabular-nums">
                  {Number.isFinite(newMaxNumber) && newMaxNumber > 0 ? coefficientFor(newMaxNumber) : '—'}
                </span>
              </p>
            </div>
            {newOddWarning && (
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {newOddWarning}
              </p>
            )}
          </div>

          <div>
            <label className={fieldLabel} htmlFor="new-subject-columns">ជួរឈរពិន្ទុ (ជម្រើស)</label>
            <p className="mb-2 text-[11px] leading-relaxed text-text-muted">
              បើមុខវិជ្ជានេះមានច្រើនជួរឈរ សូមសរសេរខណ្ឌដោយសញ្ញាក្បៀស (,) ឧ. <strong>ទ្រឹស្តី, អនុវត្តន៍</strong>។ បើទុកទទេ វានឹងយកឈ្មោះមុខវិជ្ជាជាជួរឈរតែមួយ។
            </p>
            <input
              id="new-subject-columns"
              type="text"
              value={newColumns}
              onChange={(e) => setNewColumns(e.target.value)}
              className={controlClass(false, 'font-bold')}
              placeholder="ឧ. ទ្រឹស្តី, អនុវត្តន៍"
            />
          </div>
        </div>
      </Dialog>

      {dialog}
    </PageContainer>
  )
}
