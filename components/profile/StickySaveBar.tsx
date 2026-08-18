'use client'

import { Save, Undo2 } from 'lucide-react'

export interface StickySaveBarProps {
  /** Khmer names of the dirty sections — the bar names exactly what it saves. */
  dirtyLabels: string[]
  saving: boolean
  onSave: () => void
  onCancel: () => void
}

/**
 * Bottom-anchored save bar that appears only while something is dirty, so the
 * teacher never scrolls back up to find a save button and never wonders which
 * section a save covers — the bar lists the sections by name.
 */
export default function StickySaveBar({ dirtyLabels, saving, onSave, onCancel }: StickySaveBarProps) {
  if (dirtyLabels.length === 0) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-bg-surface/95 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <p lang="km" className="min-w-0 flex-1 text-sm leading-[1.7] text-text-body">
          <span className="font-bold text-text-heading">មិនទាន់រក្សាទុក៖ </span>
          {dirtyLabels.join(' · ')}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="tap-target inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-4 py-2.5 text-sm font-bold text-text-body transition hover:bg-paper focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Undo2 aria-hidden className="h-4 w-4" /> បោះបង់
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            aria-busy={saving}
            className="tap-target inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-6 py-2.5 text-sm font-bold text-brand-contrast shadow-md transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <span
                aria-hidden
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
              />
            ) : (
              <Save aria-hidden className="h-4 w-4" />
            )}
            {saving ? 'កំពុងរក្សាទុក...' : 'រក្សាទុក'}
          </button>
        </div>
      </div>
    </div>
  )
}
