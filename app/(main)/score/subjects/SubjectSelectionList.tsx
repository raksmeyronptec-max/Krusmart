'use client'

import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/feedback/Badge'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { CurriculumEntry, EntryState } from '@/lib/scores/curriculum'

/**
 * The subject list — one row per subject the class can decide about.
 *
 * ── What this replaces, and why ────────────────────────────────────────────
 *
 * The old screen showed a flat list with four buttons on every row (លាក់ / ផ្នែករង
 * / កែ / ដកចេញ) and put the two things a teacher actually does — choosing
 * subjects, and choosing which parts of each — behind two separate modal
 * pickers. On a primary class that was thirty-four rows, twenty-three of which
 * were restatements of the other eleven (see `lib/scores/curriculum.ts`).
 *
 * Here the two decisions are the two visible controls, both inline:
 *
 *     the switch      does this class teach this subject?
 *     the chips       which of its components does it mark?
 *
 * Everything else — renaming, changing a full mark, unhiding — is rare, is not
 * what the screen is for, and lives behind the row's កែ button, which opens one
 * dialog rather than a menu that opens a dialog.
 *
 * ── លាក់ is no longer offered, only reversed ───────────────────────────────
 *
 * The old screen had two ways to make a subject stop appearing: hide it (a
 * `scope='class'` definition override) and remove it from the template (a
 * selection row). To a teacher those are the same sentence, and picking the
 * wrong one produced a subject that stayed gone even after they added it back.
 * The switch is now the single answer. A subject a teacher hid *before* this
 * shipped still renders — greyed, badged, with បង្ហាញឡើងវិញ in its កែ dialog —
 * because a state the screen refuses to show is a state they can never undo.
 *
 * Reordering stays two buttons rather than a drag. This is a phone inside a
 * scrolling page: a touch drag fights the page's own scroll, and two buttons
 * work from a keyboard and to a screen reader where a drag does not.
 *
 * They are 32px on a touch screen, not the 44px the rest of this page keeps to
 * — a stacked pair at 44px would stand taller than the row it reorders. That is
 * a deliberate exception to the touch-target floor and the only one here; it
 * replaces the 24px pair that was small enough to miss.
 */

export interface SubjectRow {
  entry: CurriculumEntry
  state: EntryState
  /** The definition layer says this subject is hidden for this class. */
  hidden: boolean
  /** This class overrides the inherited definition (renamed, or a new full mark). */
  customised: boolean
}

export function SubjectSelectionList({
  groups,
  busyKey,
  disabled,
  onToggleSubject,
  onToggleComponent,
  onMove,
  onEdit,
}: {
  groups: { label: string; rows: SubjectRow[] }[]
  busyKey: string | null
  disabled: boolean
  onToggleSubject: (row: SubjectRow) => void
  onToggleComponent: (row: SubjectRow, columnId: string) => void
  /** `null` when the row cannot move in that direction. */
  onMove: (row: SubjectRow, direction: -1 | 1) => void
  onEdit: (row: SubjectRow) => void
}) {
  // Reordering is only meaningful among the subjects the class actually
  // teaches — moving an unselected one changes nothing anybody can see.
  const selectedKeys = groups.flatMap((g) => g.rows.filter((r) => r.state.on).map((r) => r.entry.subjectKey))

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => {
        /*
          A heading that is its own only child is the subject's name written
          twice. `ភាសាខ្មែរ` sat directly above `ភាសាខ្មែរ (គ្រប់បំណិន)`, and
          `គណិតវិទ្យា` above `គណិតវិទ្យា (គ្រប់ផ្នែក)` — for a primary class that was
          five of these in the first screenful, each costing a line of type and
          a gap to say nothing the row beneath did not already say.

          So the heading is dropped exactly when it is a restatement: one row,
          whose label begins with the group's. A single-row group that genuinely
          classifies its row (កីឡា under អប់រំសុខភាព) keeps its heading, and so
          does every group holding more than one row — there the heading is
          doing the grouping work it exists for. The `<section>` keeps its
          `aria-label` either way, so nothing is lost to a screen reader.
        */
        const only = group.rows.length === 1 ? group.rows[0] : null
        const headingIsRestatement =
          only !== null && only.entry.labelKm.trim().startsWith(group.label.trim())

        return (
        <section key={group.label} aria-label={group.label}>
          {!headingIsRestatement && (
            <h3 className="mb-2 px-1 text-xs font-bold tracking-wide text-text-muted">{group.label}</h3>
          )}

          <ul className="flex flex-col gap-2">
            {group.rows.map((row) => {
              const position = selectedKeys.indexOf(row.entry.subjectKey)
              return (
                <li key={row.entry.subjectKey}>
                  <SubjectCard
                    row={row}
                    busy={busyKey === row.entry.subjectKey}
                    disabled={disabled}
                    canMoveUp={position > 0}
                    canMoveDown={position >= 0 && position < selectedKeys.length - 1}
                    onToggleSubject={() => onToggleSubject(row)}
                    onToggleComponent={(columnId) => onToggleComponent(row, columnId)}
                    onMove={(direction) => onMove(row, direction)}
                    onEdit={() => onEdit(row)}
                  />
                </li>
              )
            })}
          </ul>
        </section>
        )
      })}
    </div>
  )
}

function SubjectCard({
  row,
  busy,
  disabled,
  canMoveUp,
  canMoveDown,
  onToggleSubject,
  onToggleComponent,
  onMove,
  onEdit,
}: {
  row: SubjectRow
  busy: boolean
  disabled: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onToggleSubject: () => void
  onToggleComponent: (columnId: string) => void
  onMove: (direction: -1 | 1) => void
  onEdit: () => void
}) {
  const { entry, state, hidden, customised } = row
  const multi = entry.components.length > 1
  const partial = multi && state.on && state.columnIds.length < entry.components.length

  return (
    <div
      className={`rounded-xl border bg-bg-surface p-3 shadow-sm transition sm:p-3.5 ${
        state.on ? 'border-brand-400' : 'border-divider'
      } ${hidden ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-3">
        <SubjectSwitch
          on={state.on}
          label={entry.labelKm}
          disabled={disabled || busy}
          onChange={onToggleSubject}
        />

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-bold text-text-heading">{entry.labelKm}</span>
            {entry.isTeacherAdded && <Badge variant="info" size="sm">គ្រូបន្ថែម</Badge>}
            {customised && !entry.isTeacherAdded && <Badge variant="warning" size="sm">បានកែ</Badge>}
            {hidden && <Badge variant="danger" size="sm">បានលាក់</Badge>}
          </p>

          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
            <span>
              ពិន្ទុពេញ{' '}
              <span className="font-bold text-text-body tabular-nums">{toKhmerNumber(entry.maxScore)}</span>
            </span>
            {multi && (
              <span>
                ផ្នែក{' '}
                <span className="font-bold text-text-body tabular-nums">
                  {state.on
                    ? `${toKhmerNumber(state.columnIds.length)}/${toKhmerNumber(entry.components.length)}`
                    : toKhmerNumber(entry.components.length)}
                </span>
              </span>
            )}
            {/*
              A class whose "on" state is being carried by the old standalone
              rows. Said plainly, because the next edit rewrites those rows and
              a teacher should not discover that silently.
            */}
            {state.aliasKeys.length > 0 && (
              <span className="inline-flex items-center gap-1 text-brand">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                នឹងបញ្ចូលគ្នាពេលកែលើកក្រោយ
              </span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {busy && <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden="true" />}

          {state.on && (
            <div className="flex flex-col gap-0.5">
              <IconButton
                label={`ផ្លាស់ទី ${entry.labelKm} ឡើងលើ`}
                disabled={!canMoveUp || busy || disabled}
                onClick={() => onMove(-1)}
              >
                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
              </IconButton>
              <IconButton
                label={`ផ្លាស់ទី ${entry.labelKm} ចុះក្រោម`}
                disabled={!canMoveDown || busy || disabled}
                onClick={() => onMove(1)}
              >
                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
              </IconButton>
            </div>
          )}

          <IconButton label={`កែ ${entry.labelKm}`} disabled={busy} onClick={onEdit} tall>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {/*
        Components appear only once the subject is on and only when it has more
        than one. A single-component subject has nothing to choose — showing one
        chip that cannot be unticked would be a control that does nothing.
      */}
      {state.on && multi && (
        <fieldset className="mt-3 border-0 p-0">
          <legend className="sr-only">ផ្នែករងនៃ {entry.labelKm}</legend>
          <div className="flex flex-wrap gap-1.5">
            {entry.components.map((component) => {
              const picked = state.columnIds.includes(component.columnId)
              // The last one on cannot be turned off: a subject with no columns
              // is a row in the grid with nowhere to type. Switch the subject
              // off instead, which is the control right there on the left.
              const last = picked && state.columnIds.length === 1
              return (
                <button
                  key={component.columnId}
                  type="button"
                  role="switch"
                  aria-checked={picked}
                  disabled={busy || disabled || last}
                  title={last ? 'ត្រូវមានផ្នែកយ៉ាងតិចមួយ — បិទមុខវិជ្ជាទាំងមូលជំនួសវិញ' : undefined}
                  onClick={() => onToggleComponent(component.columnId)}
                  className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition-colors duration-200 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                    picked
                      ? 'border-brand bg-brand-100 text-brand dark:bg-brand-900/40'
                      : 'border-divider bg-bg-surface text-text-muted hover:border-brand-400 hover:text-brand'
                  } ${last ? 'opacity-70' : ''}`}
                >
                  {picked && <Check className="h-3 w-3" aria-hidden="true" />}
                  {component.label}
                </button>
              )
            })}
          </div>
          {partial && (
            <p className="mt-1.5 text-[11px] text-text-muted">
              ផ្នែកដែលមិនបានជ្រើសនឹងមិនបង្ហាញក្នុងតារាងបញ្ចូលពិន្ទុទេ។ ពិន្ទុដែលបញ្ចូលរួចមិនត្រូវបានលុប។
            </p>
          )}
        </fieldset>
      )}
    </div>
  )
}

/**
 * The teaches / does-not-teach control.
 *
 * A `role="switch"` button rather than a checkbox: this is a setting that takes
 * effect immediately, not a field in a form that will be submitted, and the
 * distinction is one a screen reader announces.
 */
function SubjectSwitch({
  on,
  label,
  disabled,
  onChange,
}: {
  on: boolean
  label: string
  disabled: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`បង្រៀនមុខវិជ្ជា ${label}`}
      disabled={disabled}
      onClick={onChange}
      className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
        on ? 'bg-brand' : 'bg-divider'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          on ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  tall,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  /**
   * Full 44px target. The stacked reorder pair stays shorter — two 44px
   * buttons would be taller than the row they reorder — but it was 24px, which
   * is small enough to be a real miss on a phone. 32px, tightening to 28px from
   * `sm` where the pointer is a mouse, is the compromise: still a compact pair,
   * no longer a fingertip-sized gamble.
   */
  tall?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex w-9 cursor-pointer items-center justify-center rounded-md border border-divider text-text-muted transition-colors duration-200 hover:border-brand-400 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
        tall ? 'h-11 sm:h-9' : 'h-8 sm:h-7'
      }`}
    >
      {children}
    </button>
  )
}
