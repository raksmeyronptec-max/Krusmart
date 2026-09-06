'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, CalendarDays, Eye, Info, ListChecks, RotateCcw,
  SlidersHorizontal, Sparkles, Table2,
} from 'lucide-react'

import { Button } from '@/components/ui/actions/Button'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { notify } from '@/components/ui/feedback/notify'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { controlClass, fieldLabel, requiredMark } from '@/components/ui/forms/fieldStyles'
import Select from '@/components/ui/forms/Select'

import { DEFAULT_SCHEME_CONFIG, coefficientOf, type GradingSchemeConfig } from '@/lib/grading/scheme'
import { schemeForLevel } from '@/lib/grading/levelSchemes'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import {
  resolveTemplateEditor,
  type EditableSubject, type TemplateContext, type TemplateScoreType,
} from '@/lib/scores/template'
import {
  entryState, foldCurriculum, groupEntries, isNoopPlan,
  planComponentToggle, planEntryToggle, planSelectionChange,
  previewColumns, selectionSummary,
  type CurriculumEntry, type SelectionPlan,
} from '@/lib/scores/curriculum'
import type { ClassSubjectSelection } from '@/lib/scores/selection'
import type { ScoreTemplateSubjectRow } from '@/lib/types'
import {
  addClassSubject, getClassTemplateRows, resetClassTemplate, updateClassSubject,
} from './actions'
import { applySubjectSelection, listClassSelection, swapSelectionOrder } from './selectionActions'
import { SubjectSelectionList, type SubjectRow } from './SubjectSelectionList'
import { GridPreview } from './GridPreview'
import { ScoreCalendarSection } from './ScoreCalendarSection'

/**
 * មុខវិជ្ជាតាមថ្នាក់ — which subjects a class teaches, and which parts of each.
 *
 * ── What this screen used to be, and what was wrong with it ────────────────
 *
 * A flat list of every row the curriculum defines, four buttons on each, two
 * modal pickers, two add buttons and a reset. For a primary class that meant
 * thirty-four rows — twenty-three of which are the other eleven said again,
 * because migration 00028 seeds both `khmer_all` (seven columns) and each of
 * its seven skills as a subject in its own right, writing the *same*
 * `scores.subject` values. A teacher who ticked ភាសាខ្មែរ and សមត្ថភាពអាន got អាន
 * twice in their grid, and nothing on the page said so.
 *
 * It also offered two different ways to make a subject disappear — លាក់ (a
 * definition override) and ដកចេញ (a selection row) — which read as one sentence
 * to a teacher and behaved differently.
 *
 * ── What it is now ─────────────────────────────────────────────────────────
 *
 * `foldCurriculum` collapses the restatements into their bundle, so the class
 * decides about eleven subjects rather than thirty-four, and each subject's
 * parts are chips inside its own row. Two controls, both inline:
 *
 *     switch      does this class teach this subject?
 *     chips       which of its components does it mark?
 *
 * and a preview of the grid those choices produce, which is the question the
 * page is really answering and which nothing here used to show.
 *
 * ── What deliberately did NOT change ───────────────────────────────────────
 *
 * The stored shape. `class_template_subjects` still holds a `subject_key` and
 * `enabled_columns`, so `applySelection`, `useScoreTemplate`, `/score/enter`,
 * `/score/total` and every report keep reading exactly what they read before.
 * The fold is presentation; deleting `lib/scores/curriculum.ts` would restore
 * the old list without a migration.
 *
 * The two add paths also stay apart (§7): "បង្កើតមុខវិជ្ជាផ្ទាល់ខ្លួន" mints a `cls_`
 * subject server-side, and picking from the curriculum cannot invent one. What
 * disappeared is the *picker dialog*, not the distinction — picking is now the
 * switch on the row.
 *
 * Labels are shown verbatim: `ភាសាខ្មែរ (គ្រប់បំណិន)` is not trimmed to `ភាសាខ្មែរ`,
 * because the score grid shows the stored label and two surfaces naming one
 * subject differently is the drift the template layering exists to prevent.
 */

/**
 * ★ មេគុណ IS A PROPERTY OF THE LEVEL, NOT OF THE NUMBER.
 *
 * This screen used to call a level-blind `coefficientFor(max)` — an
 * unconditional `max ÷ 50` — and so told a primary teacher their /10 subject
 * carried `មេគុណ 0.2`. It does not. Design §3.2's table is explicit:
 *
 *     បឋមសិក្សា       weighting `simple`       every subject weighs 1
 *     អនុ/វិទ្យាល័យ    weighting `coefficient`  មេគុណ = ពិន្ទុពេញ ÷ ៥០
 *
 * `coefficientOf` in `lib/grading/scheme.ts` has always encoded that — it
 * returns 1 whenever the scheme is not coefficient-weighted — so the fix is to
 * ask the class's own scheme rather than to divide by a constant. The
 * level-blind helper is gone from `template.ts` so nobody reaches for it again.
 *
 * The practical consequence for a primary teacher is worth stating on the form:
 * changing ពិន្ទុពេញ changes the scale a mark is entered on and changes nothing
 * about how much the subject counts. Under coefficient weighting it changes
 * both.
 */
const NATIONAL_STEP = 25

/**
 * A full mark that is not a multiple of 25 yields an unusual coefficient. Legal
 * — a private school may mark out of 68 — but worth a second look, so it warns
 * rather than blocks.
 *
 * Silent under `simple` weighting, because there is no coefficient there to be
 * odd: every subject weighs 1 whatever the full mark. The old version fired on
 * the untouched primary default of 10 and asked a teacher to confirm `មេគុណ 0.2`,
 * which was both wrong and unanswerable.
 *
 * The inherited value never warns either: a teacher who has not changed the
 * number has nothing to confirm.
 */
function oddCoefficientWarning(
  maxScore: number,
  inheritedMax: number | null,
  scheme: GradingSchemeConfig,
): string | null {
  if (scheme.weighting !== 'coefficient') return null
  if (!Number.isFinite(maxScore) || maxScore <= 0) return null
  if (inheritedMax !== null && maxScore === inheritedMax) return null
  if (maxScore % NATIONAL_STEP === 0) return null
  return `មេគុណ ${coefficientOf(maxScore, scheme)} — ប្រាកដទេ?`
}

const SCORE_TYPES: { id: TemplateScoreType; label: string }[] = [
  { id: 'monthly', label: 'ប្រចាំខែ' },
  { id: 'semester', label: 'ប្រចាំឆមាស' },
]

export default function ScoreSubjectsClient({
  initialRows,
  initialSelection,
  templateContext,
  classId,
  className,
}: {
  initialRows: ScoreTemplateSubjectRow[]
  /** The class's chosen subjects (00028). Empty when it has not configured any. */
  initialSelection: ClassSubjectSelection[]
  /** The class's curriculum context; resolution filters by it (00021). */
  templateContext: TemplateContext | null
  classId: string | null
  className: string
}) {
  const [rows, setRows] = useState(initialRows)
  const [selection, setSelection] = useState(initialSelection)
  /**
   * Top-level section: subjects or the period calendar. A *section* switch
   * above the score-type tablist, not a third tab inside it — periods are not
   * score-type-specific, and putting them beside monthly/semester would imply a
   * monthly calendar and a semester calendar.
   */
  const [section, setSection] = useState<'subjects' | 'calendar'>('subjects')
  const [scoreType, setScoreType] = useState<TemplateScoreType>('monthly')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const { confirm, dialog } = useConfirm()

  /**
   * The grading scheme this class's level uses — the authority on whether
   * មេគុណ means anything here at all. `schemeForLevel(null)` is primary, which
   * is the fallback every legacy account without a level has always graded on.
   */
  const scheme = useMemo(() => schemeForLevel(templateContext?.levelKey), [templateContext])
  const weighted = scheme.weighting === 'coefficient'

  /** Every subject the class's curriculum defines for this grid, unfolded. */
  const editable = useMemo(
    () => resolveTemplateEditor(rows, scoreType, templateContext),
    [rows, scoreType, templateContext],
  )

  /**
   * The same list, folded into subjects and their components.
   *
   * Built from the *visible* subjects: a hidden one is excluded from the fold
   * so it cannot silently swallow a column that would then have nowhere to
   * live. Hidden rows are re-attached below, where they render greyed with a
   * way to unhide.
   */
  const editableByKey = useMemo(
    () => new Map(editable.map((s) => [s.subjectKey, s])),
    [editable],
  )

  const { entries } = useMemo(
    () => foldCurriculum(editable.filter((s) => !s.hidden).map((s) => s.effective)),
    [editable],
  )

  const selectionByKey = useMemo(
    () => new Map(selection.map((s) => [s.subjectKey, s])),
    [selection],
  )

  const summary = useMemo(
    () => selectionSummary(entries, selectionByKey),
    [entries, selectionByKey],
  )

  const preview = useMemo(
    () => previewColumns(entries, selectionByKey),
    [entries, selectionByKey],
  )

  /**
   * The rows the list renders: every entry, plus the subjects this class has
   * hidden so the decision stays reversible.
   *
   * Hidden ones are appended to their own group rather than interleaved, so a
   * teacher scanning what their class teaches is not reading past subjects that
   * are switched off twice over.
   */
  const groups = useMemo(() => {
    const toRow = (entry: CurriculumEntry, hidden: boolean): SubjectRow => ({
      entry,
      state: hidden
        ? { on: false, columnIds: [], aliasKeys: [], sortOrder: entry.sortOrder }
        : entryState(entry, selectionByKey),
      hidden,
      customised: editableByKey.get(entry.subjectKey)?.override != null,
    })

    const live = groupEntries(entries).map((g) => ({
      label: g.label,
      rows: g.entries.map((e) => toRow(e, false)),
    }))

    // Hidden subjects have no fold of their own — they are single rows the
    // curriculum still defines and this class suppressed.
    const hidden = editable.filter((s) => s.hidden)
    if (hidden.length === 0) return live

    const { entries: hiddenEntries } = foldCurriculum(hidden.map((s) => s.effective))
    const byGroup = new Map(live.map((g) => [g.label, g]))
    for (const entry of hiddenEntries) {
      const group = byGroup.get(entry.groupLabel)
      if (group) group.rows.push(toRow(entry, true))
      else {
        const fresh = { label: entry.groupLabel, rows: [toRow(entry, true)] }
        byGroup.set(entry.groupLabel, fresh)
        live.push(fresh)
      }
    }
    return live
  }, [entries, editable, editableByKey, selectionByKey])

  const refresh = useCallback(async () => {
    const [next, nextSelection] = await Promise.all([
      getClassTemplateRows(classId ?? undefined),
      listClassSelection(classId ?? undefined),
    ])
    // The system layer always has rows, so an empty result means the read
    // failed. Keeping what we had beats blanking a list the teacher is editing.
    if (next.length > 0) setRows(next)
    setSelection(nextSelection)
  }, [classId])

  /** Run a write, report it in Khmer, and re-read the list it changed. */
  const run = useCallback(
    async (
      key: string,
      fn: () => Promise<{ error?: string; success?: boolean }>,
      okMessage: string | null,
    ) => {
      setBusyKey(key)
      try {
        const res = await fn()
        if (res.error) {
          notify.error(res.error)
          return false
        }
        await refresh()
        if (okMessage) notify.success(okMessage)
        return true
      } finally {
        setBusyKey(null)
      }
    },
    [refresh],
  )

  // ------------------------------------------------------------- selection
  /**
   * Send a plan from `lib/scores/curriculum.ts` to the one action that applies
   * both halves at once.
   *
   * Toggling is not toasted. A switch that visibly moves has already reported
   * itself, and a teacher setting up a class flips a dozen of them — a dozen
   * toasts would bury the one message that matters, which is a failure.
   */
  const applyPlan = useCallback(
    (subjectKey: string, plan: SelectionPlan) => {
      if (isNoopPlan(plan)) return
      return run(subjectKey, () => applySubjectSelection(plan, classId ?? undefined), null)
    },
    [classId, run],
  )

  const toggleSubject = (row: SubjectRow) =>
    applyPlan(row.entry.subjectKey, planEntryToggle(row.entry, selectionByKey))

  const toggleComponent = (row: SubjectRow, columnId: string) =>
    applyPlan(row.entry.subjectKey, planComponentToggle(row.entry, columnId, selectionByKey))

  /**
   * Reorder within the class's own list.
   *
   * Only the selected subjects can move, and only past each other — the
   * unselected ones hold no `class_template_subjects` row, so there is no order
   * to swap. `swapSelectionOrder` writes the two rows the move touches rather
   * than renumbering the list.
   *
   * The consolidation step is not optional. A subject whose "on" state is
   * carried by legacy standalone rows (`kh_read` with no `khmer_all` row) has
   * nothing stored under the key the swap addresses, so `swapSelectionOrder`
   * would report "រកមិនឃើញមុខវិជ្ជានេះទេ" about a subject visibly sitting in the
   * list. Applying the row's own current state first writes that key — a no-op
   * to everything the teacher can see, since `planSelectionChange` preserves
   * exactly the columns already ticked — and the swap then has both rows.
   */
  const move = (row: SubjectRow, direction: -1 | 1) => {
    const selected = groups
      .flatMap((g) => g.rows)
      .filter((r) => r.state.on)
      .map((r) => r.entry.subjectKey)
    const index = selected.indexOf(row.entry.subjectKey)
    const neighbour = selected[index + direction]
    if (!neighbour) return

    const needsOwnRow = !selectionByKey.has(row.entry.subjectKey)

    return run(
      row.entry.subjectKey,
      async () => {
        if (needsOwnRow) {
          const consolidated = await applySubjectSelection(
            planSelectionChange(row.entry, row.state.columnIds, selectionByKey),
            classId ?? undefined,
          )
          if (consolidated.error) return consolidated
        }
        return swapSelectionOrder(row.entry.subjectKey, neighbour, classId ?? undefined)
      },
      null,
    )
  }

  // ------------------------------------------------------------------ edit
  const [editing, setEditing] = useState<EditableSubject | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editMax, setEditMax] = useState('')
  /** The odd-coefficient hint fires on a value the teacher typed, not on open. */
  const [editMaxTouched, setEditMaxTouched] = useState(false)

  const openEdit = (row: SubjectRow) => {
    const subject = editableByKey.get(row.entry.subjectKey)
    if (!subject) return
    setEditing(subject)
    setEditLabel(subject.effective.labelKm)
    setEditMax(String(subject.effective.maxScore))
    setEditMaxTouched(false)
  }

  const editMaxNumber = Number(editMax)
  const inheritedMax = editing?.inherited ? Number(editing.inherited.max_score) : null
  const maxChanged =
    editing !== null && Number.isFinite(editMaxNumber) && editMaxNumber !== editing.effective.maxScore
  const oddWarning = editing ? oddCoefficientWarning(editMaxNumber, inheritedMax, scheme) : null

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
      () =>
        updateClassSubject(
          editing.subjectKey,
          { label_km: editLabel.trim(), max_score: editMaxNumber },
          classId ?? undefined,
        ),
      'បានរក្សាទុក',
    )
    if (ok) setEditing(null)
  }

  /**
   * Undo a hide made on the old screen.
   *
   * Offered but never its inverse: the switch is now how a class stops teaching
   * a subject, and having two controls for that was this page's worst
   * ambiguity. Nothing here can create a new hidden subject.
   */
  const unhide = async () => {
    if (!editing) return
    const ok = await run(
      editing.subjectKey,
      () => updateClassSubject(editing.subjectKey, { hidden: false }, classId ?? undefined),
      'បានបង្ហាញឡើងវិញ',
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
  const newOddWarning = oddCoefficientWarning(newMaxNumber, null, scheme)

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
                href="/classroom"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <ListChecks className="h-4 w-4" aria-hidden="true" /> បង្កើតថ្នាក់
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
            ? `កំណត់មុខវិជ្ជាដែលថ្នាក់ ${className} បង្រៀន`
            : 'កំណត់មុខវិជ្ជាដែលថ្នាក់របស់អ្នកបង្រៀន'
        }
        actions={
          <Link
            href={`/score/enter?class=${encodeURIComponent(classId)}`}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-[13px] font-bold text-text-body transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Table2 className="h-4 w-4" aria-hidden="true" /> បញ្ចូលពិន្ទុ
          </Link>
        }
      />

      {/* ----------------------------------------------------------- section */}
      <div
        role="tablist"
        aria-label="ផ្នែក"
        className="mb-4 inline-flex w-full gap-1 rounded-xl border border-divider bg-bg-surface p-1 sm:w-auto"
      >
        {([
          { id: 'subjects' as const, label: 'មុខវិជ្ជា', icon: SlidersHorizontal },
          { id: 'calendar' as const, label: 'វគ្គពិន្ទុ', icon: CalendarDays },
        ]).map(({ id, label, icon: SectionIcon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={section === id}
            onClick={() => setSection(id)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
              section === id ? 'bg-brand text-brand-contrast shadow-md' : 'text-text-muted hover:text-brand'
            }`}
          >
            <SectionIcon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {section === 'calendar' && <ScoreCalendarSection classId={classId} />}

      {section === 'subjects' && (<>
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
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-divider bg-bg-surface p-3 text-sm">
        <span className="flex items-center gap-2 font-bold text-text-heading">
          <SlidersHorizontal className="h-4 w-4 text-brand" aria-hidden="true" />
          {summary.configured ? 'ថ្នាក់នេះបង្រៀន' : 'កម្មវិធីសិក្សាទាំងមូល'}{' '}
          {toKhmerNumber(summary.subjects)} មុខវិជ្ជា
        </span>
        {/*
          Columns, not just subjects: a column is what a teacher types into, and
          "៥ មុខវិជ្ជា" badly understates a class marking twenty-two cells.
        */}
        <span className="text-text-muted">
          {toKhmerNumber(summary.columns)} ជួរពិន្ទុ
        </span>

        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-bold text-text-body transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          {showPreview ? 'លាក់គំរូតារាង' : 'មើលគំរូតារាង'}
        </button>
      </div>

      {showPreview && <GridPreview columns={preview} configured={summary.configured} />}

      {/*
        Not configured yet: the class shows the whole curriculum because it has
        never chosen. Said out loud, because a teacher reading eleven subjects
        has no way to tell whether that is their choice or the default. A banner
        rather than a wall — this class may already have a year of marks against
        the full list, and gating the page behind setup would break it.
      */}
      {!summary.configured && entries.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-400 bg-brand-100 p-3 dark:bg-brand-900/30">
          <Sparkles className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-text-heading">
              ថ្នាក់នេះមិនទាន់បានជ្រើសរើសមុខវិជ្ជាដែលកំពុងបង្រៀនទេ
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              បើកតែមុខវិជ្ជាដែលអ្នកបង្រៀន ដើម្បីឲ្យតារាងបញ្ចូលពិន្ទុខ្លីជាងមុន។ បើមិនជ្រើស ប្រព័ន្ធនឹងបង្ហាញទាំងអស់ដដែល។
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- list */}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-divider bg-bg-surface">
          <EmptyState
            kind="filtered"
            title="មិនទាន់មានមុខវិជ្ជាសម្រាប់ប្រភេទពិន្ទុនេះទេ"
            description="បង្កើតមុខវិជ្ជាផ្ទាល់ខ្លួនសម្រាប់ថ្នាក់នេះ ដើម្បីចាប់ផ្តើមបញ្ចូលពិន្ទុ។"
          />
        </div>
      ) : (
        <SubjectSelectionList
          groups={groups}
          busyKey={busyKey}
          disabled={busyKey === 'reset'}
          onToggleSubject={toggleSubject}
          onToggleComponent={toggleComponent}
          onMove={move}
          onEdit={openEdit}
        />
      )}

      {/* ----------------------------------------------------------- footer */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {/*
          Only one add button now. Picking a curriculum subject is the switch on
          its row, so what is left here is the genuinely different operation:
          inventing a subject the curriculum does not define. `addClassSubject`
          mints its `cls_` key server-side — the browser still cannot coin one.
        */}
        <Button
          printHidden={false}
          onClick={() => { setNewScoreType(scoreType); setAddOpen(true) }}
          icon={<Sparkles className="h-4 w-4" />}
        >
          បង្កើតមុខវិជ្ជាផ្ទាល់ខ្លួន
        </Button>
        <Button variant="secondary" printHidden={false} onClick={doReset} disabled={busyKey === 'reset'}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> ត្រឡប់ទៅលំនាំដើម
        </Button>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-text-muted">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          មធ្យមភាគគិតដោយចែកនឹងចំនួនមុខវិជ្ជាដែលមានពិន្ទុ
        </span>
      </div>
      </>)}

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
          {editing?.hidden && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="min-w-0 flex-1 text-xs leading-relaxed font-medium text-text-body">
                មុខវិជ្ជានេះត្រូវបានលាក់ ដូច្នេះវាមិនបង្ហាញក្នុងបញ្ជីជ្រើសរើសទេ។
              </p>
              <Button size="sm" variant="secondary" printHidden={false} onClick={unhide}>
                <Eye className="h-3.5 w-3.5" aria-hidden="true" /> បង្ហាញឡើងវិញ
              </Button>
            </div>
          )}

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
                exactly the drift design §3.2 avoids by not storing one — and it
                is derived from the *class's scheme*, so a primary subject reads
                មេគុណ ១ however it is marked.
              */}
              <p className="text-sm text-text-muted">
                មេគុណ{' '}
                <span className="font-bold text-text-heading tabular-nums">
                  {Number.isFinite(editMaxNumber) && editMaxNumber > 0
                    ? coefficientOf(editMaxNumber, scheme)
                    : '—'}
                </span>
              </p>
            </div>

            {!weighted && (
              <p className="mt-1.5 text-[11px] text-text-muted">
                កម្រិតបឋមសិក្សាមិនប្រើមេគុណទេ — គ្រប់មុខវិជ្ជាមានទម្ងន់ ១ ស្មើគ្នា។
                ការប្តូរពិន្ទុពេញប្តូរតែមាត្រដ្ឋានបញ្ចូលពិន្ទុប៉ុណ្ណោះ។
              </p>
            )}

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
        title="បង្កើតមុខវិជ្ជាផ្ទាល់ខ្លួន"
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
            <p className="mt-1.5 text-[11px] text-text-muted">
              បើមុខវិជ្ជានេះមានក្នុងកម្មវិធីសិក្សារួចហើយ សូមបើកវាពីបញ្ជីខាងលើវិញ — កុំបង្កើតជាមុខវិជ្ជាថ្មី។
            </p>
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
                  {Number.isFinite(newMaxNumber) && newMaxNumber > 0
                    ? coefficientOf(newMaxNumber, scheme)
                    : '—'}
                </span>
              </p>
            </div>
            {!weighted && (
              <p className="mt-1.5 text-[11px] text-text-muted">
                កម្រិតបឋមសិក្សាមិនប្រើមេគុណទេ — គ្រប់មុខវិជ្ជាមានទម្ងន់ ១ ស្មើគ្នា។
              </p>
            )}
            {newOddWarning && (
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {newOddWarning}
              </p>
            )}
          </div>

          <div>
            <label className={fieldLabel} htmlFor="new-subject-columns">ផ្នែករង (ជម្រើស)</label>
            <p className="mb-2 text-[11px] leading-relaxed text-text-muted">
              បើមុខវិជ្ជានេះមានច្រើនផ្នែក សូមសរសេរខណ្ឌដោយសញ្ញាក្បៀស (,) ឧ. <strong>ទ្រឹស្តី, អនុវត្តន៍</strong>។ បើទុកទទេ វានឹងមានផ្នែកតែមួយ។
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
