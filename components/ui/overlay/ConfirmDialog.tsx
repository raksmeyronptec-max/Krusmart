"use client"

import { useCallback, useRef, useState } from "react"
import { AlertTriangle, Trash2 } from "lucide-react"
import { Dialog } from "./Dialog"
import { Button } from "../actions/Button"

/**
 * Confirmation before a destructive or consequential action.
 *
 * Replaces `window.confirm()`, which the app calls six times. That native
 * dialog cannot be styled, renders in the browser's language rather than
 * Khmer, blocks the main thread, and on some mobile browsers is suppressed
 * entirely — meaning a delete could go through with no confirmation at all.
 *
 * `useConfirm()` below keeps the ergonomics of the call site close to the
 * original: `if (await confirm({...}))` instead of `if (confirm(...))`.
 */

export interface ConfirmDialogProps {
  open: boolean
  title: React.ReactNode
  /** What will happen. Be concrete — name the thing being deleted. */
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` for deletion; `warning` for consequential-but-reversible. */
  tone?: "danger" | "warning"
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "យល់ព្រម",
  cancelLabel = "បោះបង់",
  tone = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const Icon = tone === "danger" ? Trash2 : AlertTriangle

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      size="sm"
      title={title}
      dismissible={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading} printHidden={false}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading} printHidden={false}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            tone === "danger" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"
          }`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="pt-1.5 text-sm text-text-body">{message}</p>
      </div>
    </Dialog>
  )
}

type ConfirmRequest = Omit<ConfirmDialogProps, "open" | "onConfirm" | "onCancel" | "loading">

/**
 * Promise-based confirmation.
 *
 * ```tsx
 * const { confirm, dialog } = useConfirm()
 * ...
 * if (!(await confirm({ title: 'លុបសិស្ស', message: '…' }))) return
 * ...
 * return <>{dialog}…</>
 * ```
 *
 * The promise resolves `false` on cancel, Escape and backdrop dismissal, so a
 * call site can treat "not confirmed" as one case however the user got there.
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback((req: ConfirmRequest) => {
    setRequest(req)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setRequest(null)
  }, [])

  const dialog = request ? (
    <ConfirmDialog
      open
      {...request}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null

  return { confirm, dialog }
}

export default ConfirmDialog
