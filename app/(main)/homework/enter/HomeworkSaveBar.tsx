'use client'

import { AlertTriangle, Check, CircleAlert, Loader2, Pencil, RotateCcw, Save, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { HomeworkProgress } from './scores'

/**
 * The save state, said in words rather than in a spinner.
 *
 * The page it replaces claimed "រួចរាល់សម្រាប់ធ្វើសមកាលកម្ម" — cloud-ready —
 * permanently, whether or not a single mark had been written. Four states are
 * possible here and each is a fact:
 *
 *   idle    — everything typed is in the database.
 *   draft   — n cells are typed and not yet written. Says how many.
 *   saving  — a write is in flight.
 *   error   — the last write failed, with the reason and a retry.
 *
 * The bar is `sticky bottom-4`, so the count and the Save button stay reachable
 * however far down the roster the teacher has scrolled.
 */

export type SaveState = 'idle' | 'saving' | 'error'

export interface HomeworkSaveBarProps {
  state: SaveState
  /** Cells typed but not written. */
  dirtyCount: number
  /** Cells that cannot be written as they stand. Blocks the save. */
  errorCount: number
  /** Cells outside the expected range but still writable. */
  warningCount: number
  /** Reason the last write failed, when `state` is `error`. */
  errorMessage?: string | null
  progress: HomeworkProgress
  progressLabel: string
  /** Restores the grid to the snapshot taken before the last bulk fill. */
  canUndo: boolean
  onUndo: () => void
  onDiscard: () => void
  onSave: () => void
}

export function HomeworkSaveBar({
  state,
  dirtyCount,
  errorCount,
  warningCount,
  errorMessage,
  progress,
  progressLabel,
  canUndo,
  onUndo,
  onDiscard,
  onSave,
}: HomeworkSaveBarProps) {
  const dirty = dirtyCount > 0

  const status = (() => {
    if (state === 'saving') {
      return { icon: Loader2, tone: 'text-brand', spin: true, text: 'កំពុងរក្សាទុក...' }
    }
    if (state === 'error') {
      return {
        icon: CircleAlert,
        tone: 'text-danger',
        spin: false,
        text: errorMessage ? `រក្សាទុកមិនបានសម្រេច៖ ${errorMessage}` : 'រក្សាទុកមិនបានសម្រេច',
      }
    }
    if (dirty) {
      return {
        icon: Pencil,
        tone: 'text-warning',
        spin: false,
        text: `មិនទាន់រក្សាទុក ${toKhmerNumber(dirtyCount)} ប្រអប់`,
      }
    }
    return { icon: Check, tone: 'text-success', spin: false, text: 'បានរក្សាទុករួចរាល់' }
  })()

  const StatusIcon = status.icon

  return (
    <div
      data-app-chrome
      className="sticky bottom-4 z-20 mt-5 flex flex-col gap-3 rounded-xl border border-divider bg-bg-surface p-3 shadow-lg lg:flex-row lg:items-center"
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-body">
          <span className="font-bold">
            {progressLabel} {toKhmerNumber(progress.scored)}/{toKhmerNumber(progress.total)}
          </span>
          {progress.missing > 0 && (
            <span className="text-text-muted">
              ខ្វះ {toKhmerNumber(progress.missing)}
            </span>
          )}
          <span className={`flex items-center gap-1.5 text-xs font-bold ${status.tone}`}>
            <StatusIcon
              className={`h-3.5 w-3.5 shrink-0 ${status.spin ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {status.text}
          </span>
        </p>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-divider">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${progress.percent}%` }}
          />
        </div>

        {(errorCount > 0 || warningCount > 0) && (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold">
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-danger">
                <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                មានពិន្ទុមិនត្រឹមត្រូវ {toKhmerNumber(errorCount)} ប្រអប់ — សូមកែជាមុនសិន
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1 text-warning">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                ពិន្ទុលើសកម្រិតធម្មតា {toKhmerNumber(warningCount)} ប្រអប់ (នៅតែរក្សាទុកបាន)
              </span>
            )}
          </p>
        )}

        <p className="mt-1.5 hidden text-[11px] text-text-muted lg:block">
          គន្លឹះ៖ ព្រួញឡើង/ចុះ ឬ Enter ដើម្បីទៅសិស្សបន្ទាប់ · Tab ដើម្បីទៅប្រអប់បន្ទាប់ · Ctrl+S ដើម្បីរក្សាទុក
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canUndo && (
          <Button variant="secondary" printHidden={false} onClick={onUndo}>
            <Undo2 className="h-4 w-4" aria-hidden="true" /> មិនធ្វើវិញ
          </Button>
        )}

        <Button
          variant="secondary"
          printHidden={false}
          disabled={!dirty || state === 'saving'}
          onClick={onDiscard}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> បោះបង់
        </Button>

        <Button
          variant={state === 'error' ? 'danger' : 'success'}
          size="lg"
          printHidden={false}
          onClick={onSave}
          loading={state === 'saving'}
          disabled={errorCount > 0 || (!dirty && state !== 'error')}
          icon={<Save className="h-5 w-5" />}
        >
          {state === 'error' ? 'ព្យាយាមម្តងទៀត' : 'រក្សាទុកពិន្ទុ'}
        </Button>
      </div>
    </div>
  )
}

export default HomeworkSaveBar
